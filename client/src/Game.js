import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { io } from 'socket.io-client';
import { TEAMS } from './TeamData.js';
import { TRACKS } from './TrackData.js';
import { createF1CarMesh, createWheelMesh } from './CarModel.js';
import { LapTimer } from './LapTimer.js';
import { Settings } from './Settings.js';

export class Game {
    constructor() {
        this.container = document.body;
        this.clock = new THREE.Clock();
        this.socket = io('http://localhost:3000');

        // ── Settings ──
        this.settings = new Settings();

        // ── Physics World ──
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 15;
        this.world.solver.tolerance = 0.0001;

        // Physics Materials
        this.groundMaterial = new CANNON.Material('groundMaterial');
        this.wheelMaterial = new CANNON.Material('wheelMaterial');
        const wheelGroundContactMaterial = new CANNON.ContactMaterial(this.wheelMaterial, this.groundMaterial, {
            friction: 3.0,
            restitution: 0.0,
            contactEquationStiffness: 5000,
            contactEquationRelaxation: 3
        });
        this.world.addContactMaterial(wheelGroundContactMaterial);
        this.world.defaultContactMaterial.friction = 0.3;

        // ── Graphics ──
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 50, 800);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // ── Driving State ──
        this.cars = {};
        this.myCarId = null;
        this.vehicle = null;

        // Progressive input state (0..1 float values ramped over time)
        this.inputState = {
            throttle: 0,
            brake: 0,
            steerLeft: 0,
            steerRight: 0
        };
        // Raw key states
        this.rawKeys = {};
        this.drsActive = false;
        this.drsKeyWasDown = false;

        // Physics constants — F1 tuning
        this.F1 = {
            maxEngineForce: 8000,       // Peak rear-wheel force in Newtons
            maxBrakeForce: 5500,        // Peak brake force in Newtons
            brakeBiasFront: 0.6,        // 60% front brake bias (F1 standard)
            maxSteerLow: 0.55,          // Max steer angle at 0 km/h (radians)
            maxSteerHigh: 0.06,         // Max steer angle above 300 km/h
            steerSpeedFalloff: 200,     // Speed (km/h) at which steering halves
            throttleRampUp: 5.0,        // Rate per second (0→1 in 0.2s)
            throttleRampDown: 8.0,      // Rate per second (faster off)
            brakeRampUp: 10.0,          // Rate per second (0→1 in 0.1s)
            brakeRampDown: 12.0,
            steerRampUp: 4.5,           // Rate per second
            steerRampDown: 7.0,
            engineBrakeForce: 1200,     // Engine braking force (off-throttle)
            downforceCoeff: 4.5,        // Downforce coefficient (N per (m/s)^2)
            dragCoeff: 0.55,            // Aerodynamic drag coefficient
            drsDownforceReduction: 0.35, // DRS reduces rear downforce by 35%
            drsDragReduction: 0.30,     // DRS reduces drag by 30%
            topSpeedKmh: 345
        };

        // ── Initialize ──
        this.initLights();
        this.initTrack(TRACKS.monza);
        this.initInputs();
        this.initSocket();

        this.lapTimer = new LapTimer({ x: 0, y: 0, z: 0 }, 15);

        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    initLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(100, 150, 100);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 500;
        dirLight.shadow.camera.left = -150;
        dirLight.shadow.camera.right = 150;
        dirLight.shadow.camera.top = 150;
        dirLight.shadow.camera.bottom = -150;
        this.scene.add(dirLight);
    }

    initTrack(trackData) {
        // Ground
        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        this.scene.add(groundMesh);

        const groundBody = new CANNON.Body({ mass: 0, material: this.groundMaterial });
        groundBody.addShape(new CANNON.Plane());
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);

        // Track Markers
        trackData.path.forEach(point => {
            const markerGeo = new THREE.CylinderGeometry(1, 1, 0.5);
            const markerMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
            const marker = new THREE.Mesh(markerGeo, markerMat);
            marker.position.set(point.x, 0.25, point.z);
            this.scene.add(marker);
        });

        // Start/Finish banner
        const bannerGeo = new THREE.BoxGeometry(20, 5, 1);
        const bannerMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
        const banner = new THREE.Mesh(bannerGeo, bannerMat);
        banner.position.set(0, 5, 0);
        this.scene.add(banner);
    }

    initInputs() {
        window.addEventListener('keydown', (e) => {
            // Don't process game keys when settings modal is open and rebinding
            if (document.getElementById('settings-overlay')?.classList.contains('visible')) {
                return;
            }
            this.rawKeys[e.key.toLowerCase()] = true;

            // Escape toggles settings
            if (e.key === 'Escape') {
                this.settings.toggle();
            }
        });
        window.addEventListener('keyup', (e) => {
            this.rawKeys[e.key.toLowerCase()] = false;
        });
    }

    initSocket() {
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.myCarId = this.socket.id;
            const teamKeys = Object.keys(TEAMS);
            const randomTeam = teamKeys[Math.floor(Math.random() * teamKeys.length)];
            this.socket.emit('joinGame', { team: randomTeam });
        });

        this.socket.on('currentPlayers', (players) => {
            Object.keys(players).forEach(id => {
                if (id !== this.myCarId) {
                    this.addOtherCar(id, players[id]);
                } else {
                    this.createMyCar(players[id]);
                }
            });
        });

        this.socket.on('newPlayer', (player) => {
            this.addOtherCar(player.id, player);
        });

        this.socket.on('playerMoved', (playerInfo) => {
            if (this.cars[playerInfo.id]) {
                const car = this.cars[playerInfo.id];
                car.mesh.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
                car.mesh.quaternion.set(playerInfo.qx, playerInfo.qy, playerInfo.qz, playerInfo.qw);
            }
        });

        this.socket.on('playerDisconnected', (id) => {
            this.removeCar(id);
        });
    }

    createMyCar(playerInfo) {
        // ── Physics Chassis ──
        const chassisShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.18, 1.2));
        const chassisBody = new CANNON.Body({ mass: 798 }); // F1 minimum weight
        chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.1, 0)); // Offset shape up slightly
        chassisBody.position.set(0, 1.5, 0);
        chassisBody.angularDamping = 0.6;
        chassisBody.linearDamping = 0.01;

        // Lower center of mass for stability
        chassisBody.shapeOffsets[0].y = -0.05;

        // ── Visual Chassis ──
        const chassisMesh = createF1CarMesh(TEAMS[playerInfo.team].color);
        this.scene.add(chassisMesh);

        // ── RaycastVehicle ──
        this.vehicle = new CANNON.RaycastVehicle({ chassisBody });

        const baseWheelOptions = {
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 85,
            suspensionRestLength: 0.25,
            dampingRelaxation: 3.0,
            dampingCompression: 5.5,
            maxSuspensionForce: 300000,
            rollInfluence: 0.005,
            axleLocal: new CANNON.Vec3(1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
            maxSuspensionTravel: 0.1,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Front wheels — slightly smaller, more grip
        const frontOpts = {
            ...baseWheelOptions,
            radius: 0.33,
            frictionSlip: 5.5
        };
        // Front Left
        frontOpts.chassisConnectionPointLocal = new CANNON.Vec3(0.75, -0.05, 1.6);
        this.vehicle.addWheel(frontOpts);
        // Front Right
        frontOpts.chassisConnectionPointLocal = new CANNON.Vec3(-0.75, -0.05, 1.6);
        this.vehicle.addWheel(frontOpts);

        // Rear wheels — bigger, slightly less initial grip (rear-drive)
        const rearOpts = {
            ...baseWheelOptions,
            radius: 0.35,
            frictionSlip: 5.0
        };
        // Rear Left
        rearOpts.chassisConnectionPointLocal = new CANNON.Vec3(0.75, -0.05, -1.6);
        this.vehicle.addWheel(rearOpts);
        // Rear Right
        rearOpts.chassisConnectionPointLocal = new CANNON.Vec3(-0.75, -0.05, -1.6);
        this.vehicle.addWheel(rearOpts);

        this.vehicle.addToWorld(this.world);

        // Wheel Visuals
        const wheelVisuals = [];
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            const isFront = i < 2;
            const wheelMesh = createWheelMesh(isFront);
            this.scene.add(wheelMesh);
            wheelVisuals.push(wheelMesh);
        }
        this.vehicle.wheelVisuals = wheelVisuals;

        this.myCar = { mesh: chassisMesh, vehicle: this.vehicle };
        this.vehicle.chassisBody.position.set(playerInfo.x, 0.6, playerInfo.z);
    }

    addOtherCar(id, playerInfo) {
        const mesh = createF1CarMesh(TEAMS[playerInfo.team].color);
        mesh.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
        this.scene.add(mesh);
        this.cars[id] = { mesh };
    }

    removeCar(id) {
        if (this.cars[id]) {
            this.scene.remove(this.cars[id].mesh);
            delete this.cars[id];
        }
    }

    // ── Core Physics Loop ──
    updatePhysics() {
        if (!this.vehicle) return;

        const dt = Math.min(this.clock.getDelta(), 0.05); // Cap at 50ms
        const bindings = this.settings.getBindings();

        // ── Read raw key states according to current bindings ──
        const wantThrottle = this.rawKeys[bindings.throttle] || false;
        const wantBrake = this.rawKeys[bindings.brake] || false;
        const wantLeft = this.rawKeys[bindings.steerLeft] || false;
        const wantRight = this.rawKeys[bindings.steerRight] || false;
        const wantDrs = this.rawKeys[bindings.drs] || false;
        const wantReset = this.rawKeys[bindings.resetCar] || false;

        // ── Progressive input ramping ──
        this.inputState.throttle = this._ramp(this.inputState.throttle, wantThrottle ? 1 : 0, dt,
            this.F1.throttleRampUp, this.F1.throttleRampDown);
        this.inputState.brake = this._ramp(this.inputState.brake, wantBrake ? 1 : 0, dt,
            this.F1.brakeRampUp, this.F1.brakeRampDown);
        this.inputState.steerLeft = this._ramp(this.inputState.steerLeft, wantLeft ? 1 : 0, dt,
            this.F1.steerRampUp, this.F1.steerRampDown);
        this.inputState.steerRight = this._ramp(this.inputState.steerRight, wantRight ? 1 : 0, dt,
            this.F1.steerRampUp, this.F1.steerRampDown);

        // ── DRS toggle (press to activate, press again to deactivate) ──
        if (wantDrs && !this.drsKeyWasDown) {
            this.drsActive = !this.drsActive;
        }
        this.drsKeyWasDown = wantDrs;

        // ── Reset car ──
        if (wantReset) {
            this.vehicle.chassisBody.position.set(0, 2, 0);
            this.vehicle.chassisBody.quaternion.set(0, 0, 0, 1);
            this.vehicle.chassisBody.velocity.set(0, 0, 0);
            this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        }

        // ── Speed calculation ──
        const velocity = this.vehicle.chassisBody.velocity;
        const speedMs = velocity.length(); // m/s
        const speedKmh = speedMs * 3.6;

        // ── Speed-dependent steering ──
        const steerFactor = this.F1.maxSteerLow /
            (1 + (speedKmh / this.F1.steerSpeedFalloff) * (speedKmh / this.F1.steerSpeedFalloff));
        const maxSteer = Math.max(steerFactor, this.F1.maxSteerHigh);
        const steeringVal = (this.inputState.steerLeft - this.inputState.steerRight) * maxSteer;

        // ── Engine force ──
        let engineForce = 0;
        if (this.inputState.throttle > 0.01) {
            // Power curve — ramps down slightly near top speed
            const speedRatio = Math.min(speedKmh / this.F1.topSpeedKmh, 1.0);
            const powerMultiplier = 1.0 - (speedRatio * speedRatio * 0.6); // Diminishing force at high speed
            engineForce = -this.F1.maxEngineForce * this.inputState.throttle * Math.max(powerMultiplier, 0.05);
        }

        // ── Engine braking (when off throttle and not braking) ──
        let engineBrake = 0;
        if (this.inputState.throttle < 0.05 && this.inputState.brake < 0.05 && speedKmh > 5) {
            engineBrake = this.F1.engineBrakeForce * Math.min(speedKmh / 50, 1.0);
        }

        // ── Brake force with front bias ──
        const totalBrake = this.inputState.brake * this.F1.maxBrakeForce;
        const brakeFront = totalBrake * this.F1.brakeBiasFront;
        const brakeRear = totalBrake * (1 - this.F1.brakeBiasFront);

        // ── Apply forces to wheels ──
        // Rear wheel drive
        this.vehicle.applyEngineForce(engineForce, 2);
        this.vehicle.applyEngineForce(engineForce, 3);

        // Front wheel steering
        this.vehicle.setSteeringValue(steeringVal, 0);
        this.vehicle.setSteeringValue(steeringVal, 1);

        // Brakes (with bias) + engine braking on rear
        this.vehicle.setBrake(brakeFront + engineBrake * 0.3, 0);
        this.vehicle.setBrake(brakeFront + engineBrake * 0.3, 1);
        this.vehicle.setBrake(brakeRear + engineBrake * 0.7, 2);
        this.vehicle.setBrake(brakeRear + engineBrake * 0.7, 3);

        // ── Aerodynamic downforce ──
        const speedSq = speedMs * speedMs;
        let downforceCoeff = this.F1.downforceCoeff;
        let dragCoeff = this.F1.dragCoeff;

        if (this.drsActive) {
            downforceCoeff *= (1 - this.F1.drsDownforceReduction);
            dragCoeff *= (1 - this.F1.drsDragReduction);
        }

        // Apply downforce to chassis (pushes car into ground = more grip)
        const downforce = downforceCoeff * speedSq;
        this.vehicle.chassisBody.applyLocalForce(
            new CANNON.Vec3(0, -downforce, 0),
            new CANNON.Vec3(0, 0, 0)
        );

        // Aerodynamic drag (opposes velocity direction)
        const dragMag = dragCoeff * speedSq;
        if (speedMs > 0.5) {
            const dragForce = velocity.scale(-dragMag / speedMs);
            this.vehicle.chassisBody.applyForce(dragForce, this.vehicle.chassisBody.position);
        }

        // ── DRS rear wing flap animation ──
        if (this.myCar?.mesh) {
            const drsFlap = this.myCar.mesh.getObjectByName('drs-flap');
            if (drsFlap) {
                const targetRotX = this.drsActive ? -0.8 : -0.2;
                drsFlap.rotation.x += (targetRotX - drsFlap.rotation.x) * 0.15;
            }
        }

        // ── Step physics ──
        this.world.step(1 / 60, dt, 3);

        // ── Sync visuals ──
        this.myCar.mesh.position.copy(this.vehicle.chassisBody.position);
        this.myCar.mesh.quaternion.copy(this.vehicle.chassisBody.quaternion);

        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            this.vehicle.updateWheelTransform(i);
            const t = this.vehicle.wheelInfos[i].worldTransform;
            this.vehicle.wheelVisuals[i].position.copy(t.position);
            this.vehicle.wheelVisuals[i].quaternion.copy(t.quaternion);
        }

        // ── Network sync ──
        this.socket.emit('playerMovement', {
            x: this.vehicle.chassisBody.position.x,
            y: this.vehicle.chassisBody.position.y,
            z: this.vehicle.chassisBody.position.z,
            qx: this.vehicle.chassisBody.quaternion.x,
            qy: this.vehicle.chassisBody.quaternion.y,
            qz: this.vehicle.chassisBody.quaternion.z,
            qw: this.vehicle.chassisBody.quaternion.w
        });

        // ── Camera follow ──
        const relativeOffset = new THREE.Vector3(0, 3.5, 7);
        const cameraOffset = relativeOffset.applyMatrix4(this.myCar.mesh.matrixWorld);
        this.camera.position.lerp(cameraOffset, 0.08);
        this.camera.lookAt(this.myCar.mesh.position);

        // ── HUD ──
        this._updateHUD(speedKmh);

        // ── Lap timer ──
        this.lapTimer.update(this.vehicle.chassisBody.position, performance.now());
    }

    /** Smoothly ramp value toward target */
    _ramp(current, target, dt, rateUp, rateDown) {
        if (current < target) {
            return Math.min(current + rateUp * dt, target);
        } else {
            return Math.max(current - rateDown * dt, target);
        }
    }

    /** Calculate simulated gear from speed */
    _getGear(speedKmh) {
        if (speedKmh < 5) return 'N';
        if (speedKmh < 60) return '1';
        if (speedKmh < 110) return '2';
        if (speedKmh < 155) return '3';
        if (speedKmh < 200) return '4';
        if (speedKmh < 245) return '5';
        if (speedKmh < 290) return '6';
        if (speedKmh < 325) return '7';
        return '8';
    }

    _updateHUD(speedKmh) {
        // Speedometer
        const speedEl = document.getElementById('speedometer');
        if (speedEl) speedEl.innerText = Math.round(speedKmh) + ' km/h';

        // Gear indicator
        const gearEl = document.getElementById('gear-indicator');
        if (gearEl) gearEl.innerText = this._getGear(speedKmh);

        // Throttle bar
        const throttleBar = document.getElementById('throttle-bar-fill');
        if (throttleBar) throttleBar.style.width = (this.inputState.throttle * 100) + '%';

        // Brake bar
        const brakeBar = document.getElementById('brake-bar-fill');
        if (brakeBar) brakeBar.style.width = (this.inputState.brake * 100) + '%';

        // DRS indicator
        const drsEl = document.getElementById('drs-indicator');
        if (drsEl) {
            drsEl.classList.toggle('active', this.drsActive);
            drsEl.innerText = this.drsActive ? 'DRS ON' : 'DRS';
        }
    }

    start() {
        this.renderer.setAnimationLoop(() => {
            this.updatePhysics();
            this.renderer.render(this.scene, this.camera);
        });
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}
