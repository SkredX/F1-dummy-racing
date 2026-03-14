import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { TEAMS } from './TeamData.js';
import { TRACKS } from './TrackData.js';
import { createF1CarMesh } from './CarModel.js';
import { LapTimer } from './LapTimer.js';
import { Settings } from './Settings.js';
import { buildTrack } from './TrackBuilder.js';

export class Game {
    constructor() {
        this.container = document.body;
        this.clock = new THREE.Clock();
        this.hasCrashed = false; // Crash state tracker

        // ── Settings ──
        this.settings = new Settings();

        // ── Physics World ──
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.SAPBroadphase(this.world);
        this.world.solver.iterations = 10;
        this.world.defaultContactMaterial.friction = 0.3;

        // Physics Materials
        this.groundMaterial = new CANNON.Material('groundMaterial');
        this.wheelMaterial = new CANNON.Material('wheelMaterial');
        
        const contactMaterial = new CANNON.ContactMaterial(this.groundMaterial, this.wheelMaterial, {
            friction: 0.1, // Low friction since we manually handle sliding
            restitution: 0.1
        });
        this.world.addContactMaterial(contactMaterial);

        // ── Graphics ──
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x78b9e8);
        this.scene.fog = new THREE.FogExp2(0x9dc8e8, 0.0015);

        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(0, 5, 10);

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
        this.myCar = null;

        this.inputState = { throttle: 0, brake: 0, steerLeft: 0, steerRight: 0 };
        this.rawKeys = {};
        this.drsActive = false;
        this.drsKeyWasDown = false;

        // ── F1 Physics constants (Realistic Tuned) ──
        this.F1 = {
            maxSpeed: 85.0, // m/s (~306 km/h) Heavily lowered to make reaching 8th gear gradual
            acceleration: 22.0, 
            braking: 65.0,
            maxSteerLow: 0.60, // Smooth turning curve
            steerSpeedFalloff: 150,
            dragCoeffAsphalt: 0.00035,
            dragCoeffGravel: 0.005, // Lowered drag on gravel
            topSpeedKmh: 306,
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
        this.initMotionBlur();

        const teamKeys = Object.keys(TEAMS);
        const randomTeam = teamKeys[Math.floor(Math.random() * teamKeys.length)];
        this.createMyCar(randomTeam);

        // Lap Timer & Mini-map
        const sf = this.trackData.startFinish || { x: 0, z: 0 };
        this.lapTimer = new LapTimer(sf, 8, this.trackData.sectors, this.trackSpline, this.trackMiniMapPoints);
        this.initMiniMap();
        this.initSocketOptional();

        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    initMotionBlur() {
        this.drsBlurElement = document.createElement('div');
        Object.assign(this.drsBlurElement.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            pointerEvents: 'none', zIndex: '10', opacity: '0', transition: 'opacity 0.3s ease',
            backdropFilter: 'blur(10px)', webkitBackdropFilter: 'blur(10px)',
            maskImage: 'radial-gradient(circle, transparent 40%, black 100%)',
            webkitMaskImage: 'radial-gradient(circle, transparent 40%, black 100%)'
        });
        document.body.appendChild(this.drsBlurElement);
    }

    initLights() {
        this.scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3a5c3a, 0.6));
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

        const dirLight = new THREE.DirectionalLight(0xfff4e5, 1.4);
        dirLight.position.set(200, 300, 150);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 800;
        dirLight.shadow.camera.left = -300; dirLight.shadow.camera.right = 300;
        dirLight.shadow.camera.top = 300; dirLight.shadow.camera.bottom = -300;
        this.scene.add(dirLight);
        this.dirLight = dirLight;
    }

    initTrack() {
        const result = buildTrack(this.trackData, this.world, this.groundMaterial);
        
        // Add track meshes correctly
        result.meshes.forEach(m => this.scene.add(m));
        
        this.trackSpline = result.spline;
        this.trackMiniMapPoints = result.miniMapPoints;
    }

    initInputs() {
        window.addEventListener('keydown', (e) => {
            this.rawKeys[e.key.toLowerCase()] = true;
            if (e.key === 'Escape') this.settings.toggle();
        });
        window.addEventListener('keyup', (e) => {
            this.rawKeys[e.key.toLowerCase()] = false;
        });
    }

    createMyCar(team) {
        const pts = this.trackMiniMapPoints;
        let spawnX = 0, spawnZ = 0, spawnAngle = 0;

        if (pts && pts.length > 100) {
            const idx = Math.floor(pts.length * 0.02);
            spawnX = pts[idx].x;
            spawnZ = pts[idx].z;
            const ptNext = pts[(idx + 1) % pts.length];
            spawnAngle = Math.atan2(ptNext.x - spawnX, ptNext.z - spawnZ);
        }

        // ── Arcade Physics Body ──
        const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.3, 2.5));
        const chassisBody = new CANNON.Body({
            mass: 800,
            material: this.wheelMaterial,
            fixedRotation: true
        });
        // Lift shape to avoid hitting ground obstacles (fixes "objects on track" clipping)
        chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.4, 0)); 
        chassisBody.position.set(spawnX, 1.5, spawnZ);
        
        // Barrier Crash Detection listener
        chassisBody.addEventListener('collide', (e) => {
            if (!this.myCar) return;
            const speedKmh = Math.abs(this.myCar.speed * 3.6);
            if (speedKmh > 120 && !this.hasCrashed) {
                if (e.body.mass === 0) {
                    const isPlane = e.body.shapes.some(s => s instanceof CANNON.Plane);
                    if (!isPlane) { // It's a wall/barrier
                        this.hasCrashed = true;
                        document.body.style.filter = 'grayscale(100%) contrast(1.2)';
                        document.body.style.transition = 'filter 0.5s ease';
                    }
                }
            }
        });

        this.world.addBody(chassisBody);

        const chassisMesh = createF1CarMesh(TEAMS[team].color);
        this.scene.add(chassisMesh);

        this.myCar = {
            mesh: chassisMesh,
            body: chassisBody,
            team,
            speed: 0,
            lateralSpeed: 0,
            rotationY: spawnAngle,
            angularVel: 0,
            currentSteering: 0
        };

        this._spawnPos = { x: spawnX, y: 1.5, z: spawnZ };
        this._spawnAngle = spawnAngle;
    }

    // ── Multiplayer Logic ──
    initSocketOptional() {
        try {
            import('socket.io-client').then(({ io }) => {
                const socket = io('http://localhost:3000', { timeout: 3000, reconnectionAttempts: 2 });
                this.socket = socket;
                socket.on('connect', () => {
                    const teamKeys = Object.keys(TEAMS);
                    const randomTeam = teamKeys[Math.floor(Math.random() * teamKeys.length)];
                    socket.emit('joinGame', { team: randomTeam });
                });
                socket.on('currentPlayers', (players) => {
                    Object.keys(players).forEach(id => {
                        if (id !== socket.id) this.addOtherCar(id, players[id]);
                    });
                });
                socket.on('newPlayer', (player) => this.addOtherCar(player.id, player));
                socket.on('playerMoved', (info) => {
                    if (this.cars[info.id]) {
                        this.cars[info.id].mesh.position.set(info.x, info.y, info.z);
                        this.cars[info.id].mesh.quaternion.set(info.qx, info.qy, info.qz, info.qw);
                    }
                });
                socket.on('playerDisconnected', (id) => this.removeCar(id));
            }).catch(() => { console.log('Socket.io not available'); });
        } catch { console.log('Single player mode'); }
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

    // ── Mini-map Logic Restored ──
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

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = '#555'; ctx.lineWidth = 4; ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad + (p.x - minX) * scale;
            const y = pad + (p.z - minZ) * scale;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath(); ctx.stroke();

        ctx.strokeStyle = '#444'; ctx.lineWidth = 6; ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad + (p.x - minX) * scale;
            const y = pad + (p.z - minZ) * scale;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath(); ctx.stroke();

        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.beginPath();
        pts.forEach((p, i) => {
            const x = pad + (p.x - minX) * scale;
            const y = pad + (p.z - minZ) * scale;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.closePath(); ctx.stroke();

        this.miniMapBaseImage = ctx.getImageData(0, 0, w, h);
    }

    updateMiniMap(carPos) {
        if (!this.miniMapCtx || !this.miniMapTransform) return;
        const ctx = this.miniMapCtx;
        const { minX, minZ, scale, pad } = this.miniMapTransform;

        ctx.putImageData(this.miniMapBaseImage, 0, 0);

        const x = pad + (carPos.x - minX) * scale;
        const y = pad + (carPos.z - minZ) * scale;

        ctx.fillStyle = '#ff3333'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.stroke();
    }

    _ramp(current, target, dt, rateUp, rateDown) {
        if (current < target) return Math.min(current + rateUp * dt, target);
        return Math.max(current - rateDown * dt, target);
    }

    // ── Arcade Physics Loop ──
    updatePhysics() {
        if (!this.myCar) return;

        const dt = Math.min(this.clock.getDelta(), 0.05);
        const bindings = this.settings.getBindings();
        const car = this.myCar;

        const wantThrottle = this.rawKeys[bindings.throttle] || false;
        const wantBrake = this.rawKeys[bindings.brake] || false;
        const wantLeft = this.rawKeys[bindings.steerLeft] || false;
        const wantRight = this.rawKeys[bindings.steerRight] || false;
        const wantDrs = this.rawKeys[bindings.drs] || false;
        const wantReset = this.rawKeys[bindings.resetCar] || false;

        // Visual HUD Input Ramping
        this.inputState.throttle = this._ramp(this.inputState.throttle, wantThrottle ? 1 : 0, dt, 4.0, 6.0);
        this.inputState.brake = this._ramp(this.inputState.brake, wantBrake ? 1 : 0, dt, 8.0, 10.0);
        this.inputState.steerLeft = this._ramp(this.inputState.steerLeft, wantLeft ? 1 : 0, dt, 5.0, 5.0);
        this.inputState.steerRight = this._ramp(this.inputState.steerRight, wantRight ? 1 : 0, dt, 5.0, 5.0);

        if (wantDrs && !this.drsKeyWasDown) this.drsActive = !this.drsActive;
        this.drsKeyWasDown = wantDrs;

        if (wantReset) {
            car.body.position.set(this._spawnPos.x, this._spawnPos.y, this._spawnPos.z);
            car.rotationY = this._spawnAngle || 0;
            car.speed = 0; car.lateralSpeed = 0; car.angularVel = 0;
            car.body.velocity.set(0, 0, 0);
            
            this.hasCrashed = false; // Fix rendering on reset
            document.body.style.filter = 'none';
        }

        // Apply crash stop-logic
        if (this.hasCrashed) {
            car.speed = 0;
            car.lateralSpeed = 0;
            car.angularVel = 0;
            car.body.velocity.set(0, 0, 0);
        } else {
            // Surface Detection
            let minDistSq = Infinity;
            if (this.trackMiniMapPoints.length > 0) {
                for (let i = 0; i < this.trackMiniMapPoints.length; i += 5) {
                    const pt = this.trackMiniMapPoints[i];
                    const dx = car.body.position.x - pt.x;
                    const dz = car.body.position.z - pt.z;
                    const distSq = dx * dx + dz * dz;
                    if (distSq < minDistSq) minDistSq = distSq;
                }
            }
            const isOnGravel = Math.sqrt(minDistSq) > 7.5;

            // Gravel speed reduced by only 10%
            let currentMaxSpeed = isOnGravel ? this.F1.maxSpeed * 0.90 : this.F1.maxSpeed;
            if (this.drsActive) currentMaxSpeed *= 1.15; // Apply DRS Boost

            // ── Acceleration & Braking ──
            if (this.inputState.throttle > 0.05) {
                const ratio = Math.min(1, Math.abs(car.speed) / currentMaxSpeed);
                car.speed += this.F1.acceleration * this.inputState.throttle * Math.pow(1 - ratio, 0.4) * dt;
            }
            
            if (this.inputState.brake > 0.05) {
                if (car.speed > 1) car.speed -= this.F1.braking * this.inputState.brake * dt;
                else car.speed -= (this.F1.acceleration * 0.3) * this.inputState.brake * dt; 
            }

            const dragCoeff = isOnGravel ? this.F1.dragCoeffGravel : this.F1.dragCoeffAsphalt;
            car.speed -= car.speed * dragCoeff;

            if (car.speed > currentMaxSpeed) car.speed = currentMaxSpeed;
            if (car.speed < -20) car.speed = -20;

            if (Math.abs(car.speed) < 1.0 && !wantThrottle && !wantBrake) {
                car.speed = 0;
                car.lateralSpeed = 0;
            }

            // ── Arcade Steering ──
            const rawSteer = this.inputState.steerLeft - this.inputState.steerRight;
            const steerRate = isOnGravel ? 2.0 : 3.5;
            car.currentSteering += (rawSteer * this.F1.maxSteerLow - car.currentSteering) * Math.min(1, steerRate * dt);

            const speedRatio = Math.min(1, Math.abs(car.speed) / currentMaxSpeed);
            const steerSens = 2.8 * (1.0 - speedRatio * 0.55);
            const yawGain = isOnGravel ? 0.3 : 1.0;
            
            const targetYaw = car.currentSteering * steerSens * yawGain * Math.sign(car.speed);
            car.angularVel += (targetYaw - car.angularVel) * Math.min(1, 6.0 * dt);
            car.rotationY += car.angularVel * dt;

            // ── Lateral Slip (Drifting) ──
            const slipFactor = isOnGravel ? 0.04 : 0.16;
            const latTarget = -car.angularVel * Math.abs(car.speed) * slipFactor;
            car.lateralSpeed += (latTarget - car.lateralSpeed) * Math.min(1, 5.0 * dt);
            car.lateralSpeed *= Math.pow(isOnGravel ? 0.92 : 0.78, dt * 60);

            // ── Apply directly to physics body ──
            const fwdX = Math.sin(car.rotationY);
            const fwdZ = Math.cos(car.rotationY);
            const latX = Math.cos(car.rotationY);
            const latZ = -Math.sin(car.rotationY);

            car.body.velocity.x = fwdX * car.speed + latX * car.lateralSpeed;
            car.body.velocity.z = fwdZ * car.speed + latZ * car.lateralSpeed;
            
            car.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), car.rotationY);
        }

        this.world.step(1 / 60, dt, 3);

        car.mesh.position.copy(car.body.position);
        car.mesh.quaternion.copy(car.body.quaternion);

        // High-Frequency Vibration (Alive Feeling at high speeds)
        if (car.speed > 5 && !this.hasCrashed) {
            const intensity = (Math.abs(car.speed) / this.F1.maxSpeed) * 0.035; 
            car.mesh.position.x += (Math.random() - 0.5) * intensity;
            car.mesh.position.y += (Math.random() - 0.5) * intensity;
        }

        if (this.drsBlurElement) {
            this.drsBlurElement.style.opacity = (this.drsActive && wantThrottle && !this.hasCrashed) ? '1' : '0';
        }

        const speedKmh = car.speed * 3.6;
        this._updateCamera(speedKmh);
        this._updateHUD(speedKmh, this._calculateRPM(speedKmh), this._calculateGForce());
        this.updateMiniMap(car.body.position);
        if (this.lapTimer) this.lapTimer.update(car.body.position, performance.now());

        if (this.dirLight) {
            this.dirLight.shadow.camera.position.copy(car.body.position);
            this.dirLight.position.set(car.body.position.x + 100, 300, car.body.position.z + 75);
            this.dirLight.target.position.copy(car.body.position);
            this.dirLight.target.updateMatrixWorld();
        }
    }

    _updateCamera(speedKmh) {
        if (!this.myCar) return;

        const carPos = this.myCar.mesh.position;
        const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.myCar.mesh.quaternion);

        let camDistance = 8.0;
        let targetFov = 70;

        if (this.drsActive && this.rawKeys[this.settings.getBindings().throttle]) {
            camDistance = 8.5; 
            targetFov = 95;    
        } else if (speedKmh > 150) {
            targetFov = 70 + (speedKmh - 150) * 0.15;
        }

        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 0.1);
        this.camera.updateProjectionMatrix();

        const idealPos = new THREE.Vector3(
            carPos.x - forward.x * camDistance,
            carPos.y + 3.0,
            carPos.z - forward.z * camDistance
        );

        this.camera.position.copy(idealPos);
        this.camera.lookAt(new THREE.Vector3(carPos.x + forward.x * 20, carPos.y + 1, carPos.z + forward.z * 20));
    }

    _calculateRPM(speedKmh) {
        const gear = this._getGearNum(speedKmh);
        const gearRatios = [0, 40, 80, 120, 160, 200, 240, 275, 306];
        const minSpeed = gearRatios[gear - 1] || 0;
        const maxSpeed = gearRatios[gear] || 306;
        const ratio = (speedKmh - minSpeed) / (maxSpeed - minSpeed);
        const rpm = this.F1.idleRPM + ratio * (this.F1.maxRPM - this.F1.idleRPM);
        return Math.min(Math.max(rpm, this.F1.idleRPM), this.F1.maxRPM);
    }

    _calculateGForce() {
        if (!this.myCar) return { lateral: 0, longitudinal: 0 };
        const vel = this.myCar.body.velocity;
        
        const fwdX = Math.sin(this.myCar.rotationY);
        const fwdZ = Math.cos(this.myCar.rotationY);
        const longSpeed = vel.x * fwdX + vel.z * fwdZ;
        const latSpeed = vel.x * Math.cos(this.myCar.rotationY) + vel.z * -Math.sin(this.myCar.rotationY);

        const dt = 1 / 60;
        const longG = (longSpeed - (this._prevLongSpeed || 0)) / dt / 9.82;
        const latG = (latSpeed - (this._prevLatSpeed || 0)) / dt / 9.82;

        this._prevLongSpeed = longSpeed;
        this._prevLatSpeed = latSpeed;

        return {
            lateral: Math.max(-5, Math.min(5, latG)),
            longitudinal: Math.max(-5, Math.min(5, longG))
        };
    }

    // Adjusted scaled speeds to realistically climb gears up to 306km/h
    _getGear(speedKmh) {
        if (speedKmh < 5) return 'N'; if (speedKmh < 40) return '1'; if (speedKmh < 80) return '2';
        if (speedKmh < 120) return '3'; if (speedKmh < 160) return '4'; if (speedKmh < 200) return '5';
        if (speedKmh < 240) return '6'; if (speedKmh < 275) return '7'; return '8';
    }

    _getGearNum(speedKmh) {
        if (speedKmh < 5) return 1; if (speedKmh < 40) return 1; if (speedKmh < 80) return 2;
        if (speedKmh < 120) return 3; if (speedKmh < 160) return 4; if (speedKmh < 200) return 5;
        if (speedKmh < 240) return 6; if (speedKmh < 275) return 7; return 8;
    }

    // ── HUD Graphics Restored ──
    _updateHUD(speedKmh, rpm, gForce) {
        const speedEl = document.getElementById('speedometer');
        if (speedEl) speedEl.innerText = Math.round(speedKmh) + ' km/h';

        const gearEl = document.getElementById('gear-indicator');
        if (gearEl) gearEl.innerText = this._getGear(speedKmh);

        const throttleBar = document.getElementById('throttle-bar-fill');
        if (throttleBar) throttleBar.style.width = (this.inputState.throttle * 100) + '%';

        const brakeBar = document.getElementById('brake-bar-fill');
        if (brakeBar) brakeBar.style.width = (this.inputState.brake * 100) + '%';

        const drsEl = document.getElementById('drs-indicator');
        if (drsEl) {
            drsEl.classList.toggle('active', this.drsActive);
            drsEl.innerText = this.drsActive ? 'DRS ON' : 'DRS';
        }

        const rpmFill = document.getElementById('rpm-bar-fill');
        const rpmText = document.getElementById('rpm-text');
        if (rpmFill) {
            const rpmPct = ((rpm - this.F1.idleRPM) / (this.F1.maxRPM - this.F1.idleRPM)) * 100;
            rpmFill.style.width = Math.min(rpmPct, 100) + '%';
            if (rpmPct > 90) rpmFill.style.background = 'linear-gradient(90deg, #00c853, #c6ff00, #ffea00, #ff6d00, #d500f9)';
            else if (rpmPct > 75) rpmFill.style.background = 'linear-gradient(90deg, #00c853, #c6ff00, #ffea00, #ff6d00)';
            else if (rpmPct > 50) rpmFill.style.background = 'linear-gradient(90deg, #00c853, #c6ff00, #ffea00)';
            else rpmFill.style.background = 'linear-gradient(90deg, #00c853, #c6ff00)';
        }
        if (rpmText) rpmText.innerText = Math.round(rpm);

        const gDot = document.getElementById('g-force-dot');
        if (gDot) {
            const maxOffset = 20;
            const latOffset = Math.max(-maxOffset, Math.min(maxOffset, gForce.lateral * 8));
            const longOffset = Math.max(-maxOffset, Math.min(maxOffset, -gForce.longitudinal * 8));
            gDot.style.transform = `translate(${latOffset}px, ${longOffset}px)`;
        }
        
        const gText = document.getElementById('g-force-text');
        if (gText) {
            const totalG = Math.sqrt(gForce.lateral * gForce.lateral + gForce.longitudinal * gForce.longitudinal);
            gText.innerText = totalG.toFixed(1) + 'G';
        }

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