import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TEAMS } from './TeamData.js';
import { TRACKS } from './TrackData.js';
import { createF1CarMesh, createWheelMesh } from './CarModel.js';
import { LapTimer } from './LapTimer.js';
import { Settings } from './Settings.js';
import { buildTrack, getTrackSpline } from './TrackBuilder.js';

export class Game {
    constructor() {
        this.container = document.body;
        this.clock = new THREE.Clock();

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
            friction: 2.5,
            restitution: 0.0,
            contactEquationStiffness: 1e7,
            contactEquationRelaxation: 4
        });
        this.world.addContactMaterial(wheelGroundContactMaterial);
        this.world.defaultContactMaterial.friction = 0.3;

        // ── Graphics ──
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x78b9e8);
        this.scene.fog = new THREE.FogExp2(0x9dc8e8, 0.0015);

        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.container.appendChild(this.renderer.domElement);

        // ── Driving State ──
        this.cars = {};
        this.vehicle = null;
        this.myCar = null;

        // Progressive input state
        this.inputState = { throttle: 0, brake: 0, steerLeft: 0, steerRight: 0 };
        this.rawKeys = {};
        this.drsActive = false;
        this.drsKeyWasDown = false;

        // ── Physics constants — F1 tuning ──
        this.F1 = {
            maxEngineForce: 12000,
            maxBrakeForce: 5500,
            brakeBiasFront: 0.6,
            maxSteerLow: 0.55,
            maxSteerHigh: 0.06,
            steerSpeedFalloff: 200,
            throttleRampUp: 5.0,
            throttleRampDown: 8.0,
            brakeRampUp: 10.0,
            brakeRampDown: 12.0,
            steerRampUp: 4.5,
            steerRampDown: 7.0,
            engineBrakeForce: 1200,
            downforceCoeff: 4.5,
            dragCoeff: 0.55,
            drsDownforceReduction: 0.35,
            drsDragReduction: 0.30,
            topSpeedKmh: 345,
            maxRPM: 15000,
            idleRPM: 4000
        };

        // Track data
        this.trackData = TRACKS.monza;
        this.trackSpline = null;
        this.trackMiniMapPoints = [];

        // ── Initialize ──
        this.initLights();
        this.initTrack();
        this.initInputs();

        // ── Create car immediately (no server dependency) ──
        const teamKeys = Object.keys(TEAMS);
        const randomTeam = teamKeys[Math.floor(Math.random() * teamKeys.length)];
        this.createMyCar(randomTeam);

        // ── Lap Timer ──
        const sf = this.trackData.startFinish || { x: 0, z: 0 };
        this.lapTimer = new LapTimer(
            sf,
            8,
            this.trackData.sectors,
            this.trackSpline,
            this.trackMiniMapPoints
        );

        // ── Mini-map ──
        this.initMiniMap();

        // ── Socket.io (optional multiplayer) ──
        this.initSocketOptional();

        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    initLights() {
        // Hemisphere light for sky/ground ambient
        const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3a5c3a, 0.6);
        this.scene.add(hemiLight);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.35);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xfff4e5, 1.4);
        dirLight.position.set(200, 300, 150);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 800;
        dirLight.shadow.camera.left = -300;
        dirLight.shadow.camera.right = 300;
        dirLight.shadow.camera.top = 300;
        dirLight.shadow.camera.bottom = -300;
        dirLight.shadow.bias = -0.0005;
        this.scene.add(dirLight);
        this.dirLight = dirLight;

        // Sun visual
        const sunGeo = new THREE.SphereGeometry(15, 16, 16);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
        const sun = new THREE.Mesh(sunGeo, sunMat);
        sun.position.set(400, 600, 300);
        this.scene.add(sun);
    }

    initTrack() {
        const result = buildTrack(this.trackData, this.world, this.groundMaterial);
        result.meshes.forEach(m => this.scene.add(m));
        this.trackSpline = result.spline;
        this.trackMiniMapPoints = result.miniMapPoints;
    }

    initInputs() {
        window.addEventListener('keydown', (e) => {
            if (document.getElementById('settings-overlay')?.classList.contains('visible')) return;
            this.rawKeys[e.key.toLowerCase()] = true;
            if (e.key === 'Escape') this.settings.toggle();
        });
        window.addEventListener('keyup', (e) => {
            this.rawKeys[e.key.toLowerCase()] = false;
        });
    }

    initSocketOptional() {
        try {
            import('socket.io-client').then(({ io }) => {
                const socket = io('http://localhost:3000', {
                    timeout: 3000,
                    reconnectionAttempts: 2
                });
                this.socket = socket;

                socket.on('connect', () => {
                    console.log('Multiplayer connected:', socket.id);
                    const teamKeys = Object.keys(TEAMS);
                    const randomTeam = teamKeys[Math.floor(Math.random() * teamKeys.length)];
                    socket.emit('joinGame', { team: randomTeam });
                });

                socket.on('currentPlayers', (players) => {
                    Object.keys(players).forEach(id => {
                        if (id !== socket.id) {
                            this.addOtherCar(id, players[id]);
                        }
                    });
                });

                socket.on('newPlayer', (player) => this.addOtherCar(player.id, player));

                socket.on('playerMoved', (info) => {
                    if (this.cars[info.id]) {
                        const car = this.cars[info.id];
                        car.mesh.position.set(info.x, info.y, info.z);
                        car.mesh.quaternion.set(info.qx, info.qy, info.qz, info.qw);
                    }
                });

                socket.on('playerDisconnected', (id) => this.removeCar(id));

                socket.on('connect_error', () => {
                    console.log('Multiplayer server not available — running in single-player mode');
                    socket.disconnect();
                });
            }).catch(() => {
                console.log('Socket.io not available — single-player mode');
            });
        } catch {
            console.log('Running in single-player mode');
        }
    }

    createMyCar(team) {
        // ── Spawn from the same spline points used to build the road mesh ──
        // This guarantees the car is on the centerline of the road geometry
        const pts = this.trackMiniMapPoints;
        let spawnX = 0, spawnZ = 0, spawnAngle = 0;

        if (pts && pts.length > 100) {
            // Sample on the main straight, just after start/finish
            const idx = Math.floor(pts.length * 0.02);
            const pt = pts[idx];
            const ptNext = pts[(idx + 1) % pts.length];
            spawnX = pt.x;
            spawnZ = pt.z;
            const dx = ptNext.x - pt.x;
            const dz = ptNext.z - pt.z;
            spawnAngle = Math.atan2(dx, dz);
        }

        const spawnY = 1.0;
        console.log(`Car spawning at: x=${spawnX.toFixed(1)}, y=${spawnY}, z=${spawnZ.toFixed(1)}, angle=${spawnAngle.toFixed(3)} rad`);

        // ── Physics Chassis ──
        const chassisShape = new CANNON.Box(new CANNON.Vec3(0.9, 0.25, 2.2));
        const chassisBody = new CANNON.Body({ mass: 850 });
        chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.1, 0));
        chassisBody.position.set(spawnX, spawnY + 1.0, spawnZ); // Drop from slightly higher
        chassisBody.angularDamping = 0.6;
        chassisBody.linearDamping = 0.01;
        chassisBody.shapeOffsets[0].y = -0.05;

        // ── Visual Chassis ──
        const chassisMesh = createF1CarMesh(TEAMS[team].color);
        this.scene.add(chassisMesh);

        // ── RaycastVehicle ──

        this.vehicle = new CANNON.RaycastVehicle({ chassisBody });

        const baseWheelOptions = {
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 110, // Stiffened to support the larger chassis
            suspensionRestLength: 0.25,
            dampingRelaxation: 3.0,
            dampingCompression: 5.5,
            maxSuspensionForce: 300000,
            rollInfluence: 0.01,
            axleLocal: new CANNON.Vec3(1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
            maxSuspensionTravel: 0.3 // Increased so the floor doesn't scrape the track
            // Note: Removed the customSlidingRotationalSpeed lines completely to fix traction loss
        };

        // Front wheels - Coordinates matched precisely to your friend's RB20 model
        const frontOpts = { ...baseWheelOptions, radius: 0.33, frictionSlip: 8.0 };
        frontOpts.chassisConnectionPointLocal = new CANNON.Vec3(1.1, -0.1, 1.5);
        this.vehicle.addWheel(frontOpts);
        frontOpts.chassisConnectionPointLocal = new CANNON.Vec3(-1.1, -0.1, 1.5);
        this.vehicle.addWheel(frontOpts);

        // Rear wheels
        const rearOpts = { ...baseWheelOptions, radius: 0.35, frictionSlip: 8.0 };
        rearOpts.chassisConnectionPointLocal = new CANNON.Vec3(1.1, -0.1, -1.8);
        this.vehicle.addWheel(rearOpts);
        rearOpts.chassisConnectionPointLocal = new CANNON.Vec3(-1.1, -0.1, -1.8);
        this.vehicle.addWheel(rearOpts);
        this.vehicle.addToWorld(this.world);
        this.world.addBody(chassisBody);

        // Wheel Visuals
        const wheelVisuals = [];
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            const isFront = i < 2;
            const wheelMesh = createWheelMesh(isFront);
            this.scene.add(wheelMesh);
            wheelVisuals.push(wheelMesh);
        }
        this.vehicle.wheelVisuals = wheelVisuals;

        this.myCar = { mesh: chassisMesh, vehicle: this.vehicle, team };

        // Apply computed heading
        this.vehicle.chassisBody.quaternion.setFromEuler(0, spawnAngle, 0);

        // Store for reset
        this._spawnPos = { x: spawnX, y: spawnY + 0.5, z: spawnZ };
        this._spawnAngle = spawnAngle;
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

    // ── Mini-map ──
    initMiniMap() {
        const canvas = document.getElementById('minimap-canvas');
        if (!canvas) return;
        this.miniMapCanvas = canvas;
        this.miniMapCtx = canvas.getContext('2d');
        this.drawMiniMapBase();
    }

    drawMiniMapBase() {
        if (!this.miniMapCtx || !this.trackMiniMapPoints.length) return;
        const ctx = this.miniMapCtx;
        const w = this.miniMapCanvas.width;
        const h = this.miniMapCanvas.height;
        const pts = this.trackMiniMapPoints;

        // Find bounds
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        pts.forEach(p => {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
            minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
        });

        const pad = 20;
        const scaleX = (w - pad * 2) / (maxX - minX || 1);
        const scaleZ = (h - pad * 2) / (maxZ - minZ || 1);
        const scale = Math.min(scaleX, scaleZ);

        this.miniMapTransform = { minX, minZ, scale, pad, w, h, maxX, maxZ };

        // Draw track outline
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#555';
        ctx.lineWidth = 4;
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad + (p.x - minX) * scale;
            const y = pad + (p.z - minZ) * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();

        // Draw track surface (wider line underneath)
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 6;
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad + (p.x - minX) * scale;
            const y = pad + (p.z - minZ) * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();

        // Thinner bright line on top
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad + (p.x - minX) * scale;
            const y = pad + (p.z - minZ) * scale;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();

        // Save base image
        this.miniMapBaseImage = ctx.getImageData(0, 0, w, h);
    }

    updateMiniMap(carPos) {
        if (!this.miniMapCtx || !this.miniMapTransform) return;
        const ctx = this.miniMapCtx;
        const { minX, minZ, scale, pad } = this.miniMapTransform;

        // Restore base
        ctx.putImageData(this.miniMapBaseImage, 0, 0);

        // Draw car dot
        const x = pad + (carPos.x - minX) * scale;
        const y = pad + (carPos.z - minZ) * scale;

        ctx.fillStyle = '#ff3333';
        ctx.shadowColor = '#ff0000';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // White border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.stroke();
    }

    // ── Core Physics Loop ──
    updatePhysics() {
        if (!this.vehicle) return;

        const dt = Math.min(this.clock.getDelta(), 0.05);
        const bindings = this.settings.getBindings();

        // ── Read raw key states ──
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

        // ── DRS toggle ──
        if (wantDrs && !this.drsKeyWasDown) this.drsActive = !this.drsActive;
        this.drsKeyWasDown = wantDrs;

        // ── Reset car ──
        if (wantReset) {
            const sp = this._spawnPos || { x: 0, y: 1.3, z: 0 };
            this.vehicle.chassisBody.position.set(sp.x, sp.y, sp.z);
            this.vehicle.chassisBody.quaternion.setFromEuler(0, this._spawnAngle || 0, 0);
            this.vehicle.chassisBody.velocity.set(0, 0, 0);
            this.vehicle.chassisBody.angularVelocity.set(0, 0, 0);
        }

        // ── Speed calculation ──
        const velocity = this.vehicle.chassisBody.velocity;
        const speedMs = velocity.length();
        const speedKmh = speedMs * 3.6;

        // ── Speed-dependent steering ──
        const steerFactor = this.F1.maxSteerLow /
            (1 + (speedKmh / this.F1.steerSpeedFalloff) * (speedKmh / this.F1.steerSpeedFalloff));
        const maxSteer = Math.max(steerFactor, this.F1.maxSteerHigh);
        const steeringVal = (this.inputState.steerLeft - this.inputState.steerRight) * maxSteer;

        // ── Engine force (positive = forward in cannon-es RaycastVehicle) ──
        let engineForce = 0;
        if (this.inputState.throttle > 0.01) {
            const speedRatio = Math.min(speedKmh / this.F1.topSpeedKmh, 1.0);
            const powerMultiplier = 1.0 - (speedRatio * speedRatio * 0.6);
            engineForce = this.F1.maxEngineForce * this.inputState.throttle * Math.max(powerMultiplier, 0.05);
        }

        // ── Engine braking ──
        let engineBrake = 0;
        if (this.inputState.throttle < 0.05 && this.inputState.brake < 0.05 && speedKmh > 5) {
            engineBrake = this.F1.engineBrakeForce * Math.min(speedKmh / 50, 1.0);
        }

        // ── Brake force ──
        const totalBrake = this.inputState.brake * this.F1.maxBrakeForce;
        const brakeFront = totalBrake * this.F1.brakeBiasFront;
        const brakeRear = totalBrake * (1 - this.F1.brakeBiasFront);

        // ── Apply forces ──
        this.vehicle.applyEngineForce(engineForce, 2);
        this.vehicle.applyEngineForce(engineForce, 3);
        this.vehicle.setSteeringValue(steeringVal, 0);
        this.vehicle.setSteeringValue(steeringVal, 1);

        this.vehicle.setBrake(brakeFront + engineBrake * 0.3, 0);
        this.vehicle.setBrake(brakeFront + engineBrake * 0.3, 1);
        this.vehicle.setBrake(brakeRear + engineBrake * 0.7, 2);
        this.vehicle.setBrake(brakeRear + engineBrake * 0.7, 3);

        // ── Aerodynamics ──
        const speedSq = speedMs * speedMs;
        let downforceCoeff = this.F1.downforceCoeff;
        let dragCoeff = this.F1.dragCoeff;

        if (this.drsActive) {
            downforceCoeff *= (1 - this.F1.drsDownforceReduction);
            dragCoeff *= (1 - this.F1.drsDragReduction);
        }

        const downforce = downforceCoeff * speedSq;
        this.vehicle.chassisBody.applyLocalForce(
            new CANNON.Vec3(0, -downforce, 0),
            new CANNON.Vec3(0, 0, 0)
        );

        const dragMag = dragCoeff * speedSq;
        if (speedMs > 0.5) {
            const dragForce = velocity.scale(-dragMag / speedMs);
            this.vehicle.chassisBody.applyForce(dragForce, this.vehicle.chassisBody.position);
        }

        // ── DRS flap animation ──
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

        // ── Optional multiplayer sync ──
        if (this.socket?.connected) {
            this.socket.emit('playerMovement', {
                x: this.vehicle.chassisBody.position.x,
                y: this.vehicle.chassisBody.position.y,
                z: this.vehicle.chassisBody.position.z,
                qx: this.vehicle.chassisBody.quaternion.x,
                qy: this.vehicle.chassisBody.quaternion.y,
                qz: this.vehicle.chassisBody.quaternion.z,
                qw: this.vehicle.chassisBody.quaternion.w
            });
        }

        // ── Camera follow ──
        this._updateCamera();

        // ── RPM calculation ──
        const rpm = this._calculateRPM(speedKmh);

        // ── G-force calculation ──
        const gForce = this._calculateGForce();

        // ── HUD ──
        this._updateHUD(speedKmh, rpm, gForce);

        // ── Mini-map ──
        this.updateMiniMap(this.vehicle.chassisBody.position);

        // ── Lap timer ──
        this.lapTimer.update(this.vehicle.chassisBody.position, performance.now());

        // ── Move shadow camera with car ──
        if (this.dirLight) {
            this.dirLight.shadow.camera.position.copy(this.vehicle.chassisBody.position);
            this.dirLight.position.set(
                this.vehicle.chassisBody.position.x + 100,
                300,
                this.vehicle.chassisBody.position.z + 75
            );
            this.dirLight.target.position.copy(this.vehicle.chassisBody.position);
            this.dirLight.target.updateMatrixWorld();
        }
    }

    _updateCamera() {
        if (!this.myCar) return;

        const carPos = this.myCar.mesh.position;
        const carQuat = this.myCar.mesh.quaternion;

        // Get car forward direction
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(carQuat);

        // Camera offset behind and above the car
        const camDistance = 8;
        const camHeight = 3.0;

        const idealPos = new THREE.Vector3(
            carPos.x - forward.x * camDistance,
            carPos.y + camHeight,
            carPos.z - forward.z * camDistance
        );

        // Smooth camera follow
        this.camera.position.lerp(idealPos, 0.06);

        // Look at a point slightly ahead of the car
        const lookTarget = new THREE.Vector3(
            carPos.x + forward.x * 5,
            carPos.y + 1,
            carPos.z + forward.z * 5
        );
        this.camera.lookAt(lookTarget);
    }

    _calculateRPM(speedKmh) {
        const gear = this._getGearNum(speedKmh);
        const gearRatios = [0, 60, 110, 155, 200, 245, 290, 325, 350];
        const minSpeed = gearRatios[gear - 1] || 0;
        const maxSpeed = gearRatios[gear] || 350;
        const ratio = (speedKmh - minSpeed) / (maxSpeed - minSpeed);
        const rpm = this.F1.idleRPM + ratio * (this.F1.maxRPM - this.F1.idleRPM);
        return Math.min(Math.max(rpm, this.F1.idleRPM), this.F1.maxRPM);
    }

    _calculateGForce() {
        if (!this.vehicle) return { lateral: 0, longitudinal: 0 };

        const vel = this.vehicle.chassisBody.velocity;
        const quat = this.vehicle.chassisBody.quaternion;

        // Get car's local axes
        const forward = new CANNON.Vec3(0, 0, -1);
        const right = new CANNON.Vec3(1, 0, 0);
        quat.vmult(forward, forward);
        quat.vmult(right, right);

        // Project velocity onto car axes
        const longSpeed = vel.dot(forward);
        const latSpeed = vel.dot(right);

        // Approximate from velocity change (simplified)
        if (!this._prevLongSpeed) this._prevLongSpeed = 0;
        if (!this._prevLatSpeed) this._prevLatSpeed = 0;

        const dt = 1 / 60;
        const longG = (longSpeed - this._prevLongSpeed) / dt / 9.82;
        const latG = (latSpeed - this._prevLatSpeed) / dt / 9.82;

        this._prevLongSpeed = longSpeed;
        this._prevLatSpeed = latSpeed;

        return {
            lateral: Math.max(-5, Math.min(5, latG)),
            longitudinal: Math.max(-5, Math.min(5, longG))
        };
    }

    _ramp(current, target, dt, rateUp, rateDown) {
        if (current < target) return Math.min(current + rateUp * dt, target);
        return Math.max(current - rateDown * dt, target);
    }

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

    _getGearNum(speedKmh) {
        if (speedKmh < 5) return 1;
        if (speedKmh < 60) return 1;
        if (speedKmh < 110) return 2;
        if (speedKmh < 155) return 3;
        if (speedKmh < 200) return 4;
        if (speedKmh < 245) return 5;
        if (speedKmh < 290) return 6;
        if (speedKmh < 325) return 7;
        return 8;
    }

    _updateHUD(speedKmh, rpm, gForce) {
        // Speed
        const speedEl = document.getElementById('speedometer');
        if (speedEl) speedEl.innerText = Math.round(speedKmh) + ' km/h';

        // Gear
        const gearEl = document.getElementById('gear-indicator');
        if (gearEl) gearEl.innerText = this._getGear(speedKmh);

        // Throttle bar
        const throttleBar = document.getElementById('throttle-bar-fill');
        if (throttleBar) throttleBar.style.width = (this.inputState.throttle * 100) + '%';

        // Brake bar
        const brakeBar = document.getElementById('brake-bar-fill');
        if (brakeBar) brakeBar.style.width = (this.inputState.brake * 100) + '%';

        // DRS
        const drsEl = document.getElementById('drs-indicator');
        if (drsEl) {
            drsEl.classList.toggle('active', this.drsActive);
            drsEl.innerText = this.drsActive ? 'DRS ON' : 'DRS';
        }

        // RPM bar
        const rpmFill = document.getElementById('rpm-bar-fill');
        const rpmText = document.getElementById('rpm-text');
        if (rpmFill) {
            const rpmPct = ((rpm - this.F1.idleRPM) / (this.F1.maxRPM - this.F1.idleRPM)) * 100;
            rpmFill.style.width = Math.min(rpmPct, 100) + '%';

            // Color graduation
            if (rpmPct > 90) rpmFill.style.background = 'linear-gradient(90deg, #00c853, #c6ff00, #ffea00, #ff6d00, #d500f9)';
            else if (rpmPct > 75) rpmFill.style.background = 'linear-gradient(90deg, #00c853, #c6ff00, #ffea00, #ff6d00)';
            else if (rpmPct > 50) rpmFill.style.background = 'linear-gradient(90deg, #00c853, #c6ff00, #ffea00)';
            else rpmFill.style.background = 'linear-gradient(90deg, #00c853, #c6ff00)';
        }
        if (rpmText) rpmText.innerText = Math.round(rpm);

        // G-force
        const gDot = document.getElementById('g-force-dot');
        if (gDot) {
            const maxOffset = 20; // px
            const latOffset = Math.max(-maxOffset, Math.min(maxOffset, gForce.lateral * 8));
            const longOffset = Math.max(-maxOffset, Math.min(maxOffset, -gForce.longitudinal * 8));
            gDot.style.transform = `translate(${latOffset}px, ${longOffset}px)`;
        }
        const gText = document.getElementById('g-force-text');
        if (gText) {
            const totalG = Math.sqrt(gForce.lateral * gForce.lateral + gForce.longitudinal * gForce.longitudinal);
            gText.innerText = totalG.toFixed(1) + 'G';
        }

        // Lap counter
        const lapCountEl = document.getElementById('lap-count');
        if (lapCountEl && this.lapTimer) {
            lapCountEl.innerText = `LAP ${Math.max(1, this.lapTimer.currentLap)}`;
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
