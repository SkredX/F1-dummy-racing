import * as THREE from 'three';

export function createF1CarMesh(teamColor) {
    const carGroup = new THREE.Group();

    const mainColorMat = new THREE.MeshStandardMaterial({ color: teamColor, metalness: 0.2, roughness: 0.5 });
    const darkCarbonMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.1, roughness: 0.8 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });

    // --- Chassis (Main Body) ---
    // Cockpit / Nose area
    const noseGeo = new THREE.CylinderGeometry(0.2, 0.6, 2.5, 12);
    noseGeo.rotateZ(Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, mainColorMat);
    nose.position.set(0, 0.4, 0.5); // Forward
    carGroup.add(nose);

    // Main Body / Sidepods
    const bodyGeo = new THREE.BoxGeometry(1.4, 0.5, 2.0);
    const body = new THREE.Mesh(bodyGeo, mainColorMat);
    body.position.set(0, 0.4, -1.0);
    carGroup.add(body);

    // Engine Cover
    const engineCoverGeo = new THREE.BoxGeometry(0.8, 0.6, 1.5);
    const engineCover = new THREE.Mesh(engineCoverGeo, mainColorMat);
    engineCover.position.set(0, 0.8, -1.2);
    carGroup.add(engineCover);

    // --- Wings ---
    // Front Wing
    const frontWingGeo = new THREE.BoxGeometry(2.2, 0.1, 0.5);
    const frontWing = new THREE.Mesh(frontWingGeo, mainColorMat);
    frontWing.position.set(0, 0.15, 1.8);
    carGroup.add(frontWing);

    // Rear Wing
    const rearWingGeo = new THREE.BoxGeometry(1.6, 0.4, 0.1);
    const rearWing = new THREE.Mesh(rearWingGeo, mainColorMat);
    rearWing.position.set(0, 1.2, -2.2);
    carGroup.add(rearWing);

    // Rear Wing Supports
    const wingSupportGeo = new THREE.BoxGeometry(0.1, 0.8, 0.4);
    const wingSupportL = new THREE.Mesh(wingSupportGeo, darkCarbonMat);
    wingSupportL.position.set(-0.4, 0.8, -2.2);
    carGroup.add(wingSupportL);

    const wingSupportR = new THREE.Mesh(wingSupportGeo, darkCarbonMat);
    wingSupportR.position.set(0.4, 0.8, -2.2);
    carGroup.add(wingSupportR);

    // --- Halo (Simplified) ---
    const haloGeo = new THREE.TorusGeometry(0.4, 0.05, 8, 12, Math.PI);
    const halo = new THREE.Mesh(haloGeo, darkCarbonMat);
    halo.position.set(0, 0.9, -0.3);
    halo.rotation.x = -Math.PI / 2;
    carGroup.add(halo);
    const haloPost = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), darkCarbonMat);
    haloPost.position.set(0, 0.8, 0.1);
    carGroup.add(haloPost);

    carGroup.castShadow = true;
    carGroup.traverse((child) => {
        if (child.isMesh) child.castShadow = true;
    });

    return carGroup;
}

export function createWheelMesh() {
    const wheelGroup = new THREE.Group();

    // Tire
    const tireGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.4, 32);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    wheelGroup.add(tire);

    // Rim
    const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.41, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xffff00, metalness: 0.5 }); // Yellow rims
    const rim = new THREE.Mesh(rimGeo, rimMat);
    wheelGroup.add(rim);

    return wheelGroup;
}
