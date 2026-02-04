import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { io } from 'socket.io-client';
import { TEAMS } from './TeamData.js';
import { TRACKS } from './TrackData.js';
import { createF1CarMesh, createWheelMesh } from './CarModel.js';
import { LapTimer } from './LapTimer.js';

export class Game {
    constructor() {
        this.container = document.body;
        this.clock = new THREE.Clock();
        this.socket = io('http://localhost:3000');

        // Physics World
        this.world = new CANNON.World();
        this.world.gravity.set(0, -9.82, 0);
        this.world.broadphase = new CANNON.NaiveBroadphase();
        this.world.solver.iterations = 10;

        // Physics Materials
        this.groundMaterial = new CANNON.Material('groundMaterial');
        this.wheelMaterial = new CANNON.Material('wheelMaterial');
        const wheelGroundContactMaterial = new CANNON.ContactMaterial(this.wheelMaterial, this.groundMaterial, {
            friction: 2.5, // INCREASED FRICTION for Monza / F1 feel
            restitution: 0,
            contactEquationStiffness: 1000
        });
        this.world.addContactMaterial(wheelGroundContactMaterial);

        // Graphics
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.Fog(0x87CEEB, 20, 500);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 10);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // State
        this.cars = {}; // Other cars
        this.myCarId = null;
        this.keys = { w: false, a: false, s: false, d: false, " ": false };
        this.vehicle = null; // My Physics Vehicle

        // Initialize
        this.initLights();
        // CHANGED: Using Monza
        this.initTrack(TRACKS.monza);
        this.initInputs();
        this.initSocket();

        this.lapTimer = new LapTimer({ x: 0, y: 0, z: 0 }, 15); // Start line at 0,0,0

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
        dirLight.shadow.camera.left = -100;
        dirLight.shadow.camera.right = 100;
        dirLight.shadow.camera.top = 100;
        dirLight.shadow.camera.bottom = -100;
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

        const groundBody = new CANNON.Body({
            mass: 0,
            material: this.groundMaterial
        });
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
            if (this.keys.hasOwnProperty(e.key.toLowerCase())) this.keys[e.key.toLowerCase()] = true;
            if (e.key === ' ') this.keys[" "] = true;
        });
        window.addEventListener('keyup', (e) => {
            if (this.keys.hasOwnProperty(e.key.toLowerCase())) this.keys[e.key.toLowerCase()] = false;
            if (e.key === ' ') this.keys[" "] = false;
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
        // Physics Chassis
        const chassisShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.2, 1.0)); // Half extents
        const chassisBody = new CANNON.Body({ mass: 798 }); // F1 min weight approx
        chassisBody.addShape(chassisShape);
        chassisBody.position.set(0, 2, 0);
        chassisBody.angularDamping = 0.5;

        // Visual Chassis
        const chassisMesh = createF1CarMesh(TEAMS[playerInfo.team].color);
        this.scene.add(chassisMesh);

        // RaycastVehicle setup
        this.vehicle = new CANNON.RaycastVehicle({
            chassisBody: chassisBody,
        });

        const wheelOptions = {
            radius: 0.35,
            directionLocal: new CANNON.Vec3(0, -1, 0),
            suspensionStiffness: 55, // Stiffer suspension for racing
            suspensionRestLength: 0.3,
            frictionSlip: 5.0, // High grip
            dampingRelaxation: 2.3,
            dampingCompression: 4.5,
            maxSuspensionForce: 200000,
            rollInfluence: 0.01, // Prevent rollover
            axleLocal: new CANNON.Vec3(1, 0, 0),
            chassisConnectionPointLocal: new CANNON.Vec3(1, 1, 0),
            maxSuspensionTravel: 0.2,
            customSlidingRotationalSpeed: -30,
            useCustomSlidingRotationalSpeed: true
        };

        // Add 4 wheels
        // Front Left
        wheelOptions.chassisConnectionPointLocal.set(0.75, 0, 1.6);
        this.vehicle.addWheel(wheelOptions);
        // Front Right
        wheelOptions.chassisConnectionPointLocal.set(-0.75, 0, 1.6);
        this.vehicle.addWheel(wheelOptions);
        // Rear Left
        wheelOptions.chassisConnectionPointLocal.set(0.75, 0, -1.6);
        this.vehicle.addWheel(wheelOptions);
        // Rear Right
        wheelOptions.chassisConnectionPointLocal.set(-0.75, 0, -1.6);
        this.vehicle.addWheel(wheelOptions);

        this.vehicle.addToWorld(this.world);

        // Wheel Visuals
        const wheelBodies = [];
        for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
            const wheelMesh = createWheelMesh();
            this.scene.add(wheelMesh);
            wheelBodies.push(wheelMesh);
        }

        this.vehicle.wheelVisuals = wheelBodies;
        this.myCar = { mesh: chassisMesh, vehicle: this.vehicle };

        // Setup initial spawn properly
        this.vehicle.chassisBody.position.set(playerInfo.x, 0.5, playerInfo.z);
    }

    addOtherCar(id, playerInfo) {
        // Just visual for other players for now (interpolated)
        const mesh = createF1CarMesh(TEAMS[playerInfo.team].color);
        mesh.position.set(playerInfo.x, playerInfo.y, playerInfo.z);
        this.scene.add(mesh);
        this.cars[id] = { mesh: mesh };
    }

    removeCar(id) {
        if (this.cars[id]) {
            this.scene.remove(this.cars[id].mesh);
            delete this.cars[id];
        }
    }

    updatePhysics() {
        if (this.vehicle) {
            const maxSteerVal = 0.6;
            const maxForce = 3500; // Increased power
            const brakeForce = 250;

            // Controls
            let engineForce = 0;
            let steeringVal = 0;
            let brakeVal = 0;

            if (this.keys['w']) engineForce = -maxForce; // Rear wheel drive, negative for forward
            if (this.keys['s']) engineForce = maxForce / 2;
            if (this.keys['a']) steeringVal = maxSteerVal;
            if (this.keys['d']) steeringVal = -maxSteerVal;
            if (this.keys[' ']) brakeVal = 50;

            // Apply forces
            // Rear wheels drive
            this.vehicle.applyEngineForce(engineForce, 2);
            this.vehicle.applyEngineForce(engineForce, 3);

            // Front wheels steer
            this.vehicle.setSteeringValue(steeringVal, 0);
            this.vehicle.setSteeringValue(steeringVal, 1);

            this.vehicle.setBrake(brakeVal, 0);
            this.vehicle.setBrake(brakeVal, 1);
            this.vehicle.setBrake(brakeVal, 2);
            this.vehicle.setBrake(brakeVal, 3);

            // Step
            this.world.step(1 / 60);

            // Sync Visuals
            this.myCar.mesh.position.copy(this.vehicle.chassisBody.position);
            this.myCar.mesh.quaternion.copy(this.vehicle.chassisBody.quaternion);

            for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
                this.vehicle.updateWheelTransform(i);
                const t = this.vehicle.wheelInfos[i].worldTransform;
                this.vehicle.wheelVisuals[i].position.copy(t.position);
                this.vehicle.wheelVisuals[i].quaternion.copy(t.quaternion);
            }

            // Sync Network
            this.socket.emit('playerMovement', {
                x: this.vehicle.chassisBody.position.x,
                y: this.vehicle.chassisBody.position.y,
                z: this.vehicle.chassisBody.position.z,
                qx: this.vehicle.chassisBody.quaternion.x,
                qy: this.vehicle.chassisBody.quaternion.y,
                qz: this.vehicle.chassisBody.quaternion.z,
                qw: this.vehicle.chassisBody.quaternion.w
            });

            // Camera Follow
            const relativeOffset = new THREE.Vector3(0, 4, 8);
            const cameraOffset = relativeOffset.applyMatrix4(this.myCar.mesh.matrixWorld);
            this.camera.position.lerp(cameraOffset, 0.1);
            this.camera.lookAt(this.myCar.mesh.position);

            // UI & Lap Timer
            const speed = this.vehicle.chassisBody.velocity.length() * 3.6; // km/h
            document.getElementById('speedometer').innerText = Math.round(speed) + " km/h";

            this.lapTimer.update(this.vehicle.chassisBody.position, performance.now());
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
