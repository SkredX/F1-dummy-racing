import * as THREE from 'three';

export function createF1CarMesh(teamColor) {
    const carGroup = new THREE.Group();

    const mainColorMat = new THREE.MeshStandardMaterial({ color: teamColor, metalness: 0.4, roughness: 0.35 });
    const darkCarbonMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.15, roughness: 0.75 });
    const carbonFibreMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.6 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.15 });

    // ── Nose Cone (long tapered cone) ──
    const noseGeo = new THREE.ConeGeometry(0.22, 2.2, 8);
    noseGeo.rotateX(-Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, mainColorMat);
    nose.position.set(0, 0.28, 2.0);
    carGroup.add(nose);

    // Nose tip plate (flat front end)
    const noseTipGeo = new THREE.BoxGeometry(0.3, 0.08, 0.15);
    const noseTip = new THREE.Mesh(noseTipGeo, darkCarbonMat);
    noseTip.position.set(0, 0.22, 3.1);
    carGroup.add(noseTip);

    // ── Survival Cell / Monocoque ──
    const monoGeo = new THREE.BoxGeometry(0.9, 0.4, 2.8);
    const mono = new THREE.Mesh(monoGeo, mainColorMat);
    mono.position.set(0, 0.35, 0.0);
    carGroup.add(mono);

    // ── Cockpit Opening ──
    const cockpitGeo = new THREE.BoxGeometry(0.5, 0.25, 0.7);
    const cockpit = new THREE.Mesh(cockpitGeo, new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }));
    cockpit.position.set(0, 0.65, 0.1);
    carGroup.add(cockpit);

    // ── Halo ──
    const haloGeo = new THREE.TorusGeometry(0.35, 0.04, 8, 16, Math.PI);
    const halo = new THREE.Mesh(haloGeo, carbonFibreMat);
    halo.position.set(0, 0.78, 0.0);
    halo.rotation.x = -Math.PI / 2;
    carGroup.add(halo);
    // Halo center post
    const haloPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45), carbonFibreMat);
    haloPost.position.set(0, 0.7, 0.35);
    carGroup.add(haloPost);

    // ── Airbox / Engine Intake (above cockpit) ──
    const airboxGeo = new THREE.BoxGeometry(0.35, 0.45, 0.6);
    const airbox = new THREE.Mesh(airboxGeo, mainColorMat);
    airbox.position.set(0, 0.9, -0.4);
    carGroup.add(airbox);

    // Airbox inlet opening
    const inletGeo = new THREE.BoxGeometry(0.25, 0.2, 0.05);
    const inlet = new THREE.Mesh(inletGeo, new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0 }));
    inlet.position.set(0, 0.95, -0.1);
    carGroup.add(inlet);

    // ── Sidepods ──
    // Left sidepod
    const sidepodGeoL = new THREE.BoxGeometry(0.55, 0.35, 1.8);
    const sidepodL = new THREE.Mesh(sidepodGeoL, mainColorMat);
    sidepodL.position.set(-0.55, 0.35, -0.3);
    carGroup.add(sidepodL);

    // Right sidepod
    const sidepodR = new THREE.Mesh(sidepodGeoL, mainColorMat);
    sidepodR.position.set(0.55, 0.35, -0.3);
    carGroup.add(sidepodR);

    // Sidepod inlets (dark openings)
    const sidepodInletGeo = new THREE.BoxGeometry(0.12, 0.2, 0.3);
    const sidepodInletMatDark = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1.0 });
    const inletL = new THREE.Mesh(sidepodInletGeo, sidepodInletMatDark);
    inletL.position.set(-0.83, 0.4, 0.45);
    carGroup.add(inletL);
    const inletR = new THREE.Mesh(sidepodInletGeo, sidepodInletMatDark);
    inletR.position.set(0.83, 0.4, 0.45);
    carGroup.add(inletR);

    // ── Engine Cover (tapers toward rear) ──
    const engineGeo = new THREE.CylinderGeometry(0.2, 0.4, 1.6, 8);
    engineGeo.rotateX(Math.PI / 2);
    const engine = new THREE.Mesh(engineGeo, mainColorMat);
    engine.position.set(0, 0.55, -1.6);
    carGroup.add(engine);

    // ── Floor / Undertray ──
    const floorGeo = new THREE.BoxGeometry(1.6, 0.06, 4.0);
    const floor = new THREE.Mesh(floorGeo, carbonFibreMat);
    floor.position.set(0, 0.1, 0.0);
    carGroup.add(floor);

    // ── Diffuser (rear underside) ──
    const diffuserGeo = new THREE.BoxGeometry(1.4, 0.2, 0.4);
    const diffuser = new THREE.Mesh(diffuserGeo, carbonFibreMat);
    diffuser.position.set(0, 0.15, -2.2);
    diffuser.rotation.x = 0.3;
    carGroup.add(diffuser);

    // ── Front Wing ──
    // Main plane
    const fwMainGeo = new THREE.BoxGeometry(2.0, 0.06, 0.35);
    const fwMain = new THREE.Mesh(fwMainGeo, mainColorMat);
    fwMain.position.set(0, 0.12, 2.8);
    carGroup.add(fwMain);

    // Front wing flap
    const fwFlapGeo = new THREE.BoxGeometry(1.8, 0.04, 0.2);
    const fwFlap = new THREE.Mesh(fwFlapGeo, mainColorMat);
    fwFlap.position.set(0, 0.2, 2.9);
    fwFlap.rotation.x = -0.15;
    carGroup.add(fwFlap);

    // Front wing endplates
    const fwEndGeo = new THREE.BoxGeometry(0.04, 0.2, 0.5);
    const fwEndL = new THREE.Mesh(fwEndGeo, mainColorMat);
    fwEndL.position.set(-1.0, 0.18, 2.8);
    carGroup.add(fwEndL);
    const fwEndR = new THREE.Mesh(fwEndGeo, mainColorMat);
    fwEndR.position.set(1.0, 0.18, 2.8);
    carGroup.add(fwEndR);

    // ── Rear Wing ──
    // Main element
    const rwMainGeo = new THREE.BoxGeometry(1.0, 0.06, 0.3);
    const rwMain = new THREE.Mesh(rwMainGeo, mainColorMat);
    rwMain.position.set(0, 1.1, -2.3);
    rwMain.rotation.x = -0.12;
    carGroup.add(rwMain);

    // DRS flap element
    const rwFlapGeo = new THREE.BoxGeometry(0.95, 0.04, 0.18);
    const rwFlap = new THREE.Mesh(rwFlapGeo, mainColorMat);
    rwFlap.position.set(0, 1.2, -2.25);
    rwFlap.rotation.x = -0.2;
    rwFlap.name = 'drs-flap'; // For DRS animation
    carGroup.add(rwFlap);

    // Rear wing endplates
    const rwEndGeo = new THREE.BoxGeometry(0.04, 0.35, 0.35);
    const rwEndL = new THREE.Mesh(rwEndGeo, mainColorMat);
    rwEndL.position.set(-0.5, 1.05, -2.3);
    carGroup.add(rwEndL);
    const rwEndR = new THREE.Mesh(rwEndGeo, mainColorMat);
    rwEndR.position.set(0.5, 1.05, -2.3);
    carGroup.add(rwEndR);

    // Rear wing pylons/supports
    const rwPylonGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6);
    const rwPylonL = new THREE.Mesh(rwPylonGeo, carbonFibreMat);
    rwPylonL.position.set(-0.25, 0.75, -2.3);
    carGroup.add(rwPylonL);
    const rwPylonR = new THREE.Mesh(rwPylonGeo, carbonFibreMat);
    rwPylonR.position.set(0.25, 0.75, -2.3);
    carGroup.add(rwPylonR);

    // ── Front Suspension Arms ──
    const suspGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.7);
    // Upper front-left
    const susFLU = new THREE.Mesh(suspGeo, metalMat);
    susFLU.position.set(-0.6, 0.4, 1.5);
    susFLU.rotation.z = Math.PI / 4;
    carGroup.add(susFLU);
    // Lower front-left
    const susFLL = new THREE.Mesh(suspGeo, metalMat);
    susFLL.position.set(-0.6, 0.2, 1.5);
    susFLL.rotation.z = Math.PI / 5;
    carGroup.add(susFLL);
    // Upper front-right
    const susFRU = new THREE.Mesh(suspGeo, metalMat);
    susFRU.position.set(0.6, 0.4, 1.5);
    susFRU.rotation.z = -Math.PI / 4;
    carGroup.add(susFRU);
    // Lower front-right
    const susFRL = new THREE.Mesh(suspGeo, metalMat);
    susFRL.position.set(0.6, 0.2, 1.5);
    susFRL.rotation.z = -Math.PI / 5;
    carGroup.add(susFRL);

    // ── Rear Suspension Arms ──
    const rSuspGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.65);
    const susRLU = new THREE.Mesh(rSuspGeo, metalMat);
    susRLU.position.set(-0.55, 0.38, -1.5);
    susRLU.rotation.z = Math.PI / 4;
    carGroup.add(susRLU);
    const susRLL = new THREE.Mesh(rSuspGeo, metalMat);
    susRLL.position.set(-0.55, 0.18, -1.5);
    susRLL.rotation.z = Math.PI / 5;
    carGroup.add(susRLL);
    const susRRU = new THREE.Mesh(rSuspGeo, metalMat);
    susRRU.position.set(0.55, 0.38, -1.5);
    susRRU.rotation.z = -Math.PI / 4;
    carGroup.add(susRRU);
    const susRRL = new THREE.Mesh(rSuspGeo, metalMat);
    susRRL.position.set(0.55, 0.18, -1.5);
    susRRL.rotation.z = -Math.PI / 5;
    carGroup.add(susRRL);

    // ── Shadow casting ──
    carGroup.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    return carGroup;
}

export function createWheelMesh(isFront = true) {
    const wheelGroup = new THREE.Group();

    const radius = isFront ? 0.33 : 0.35;
    const width = isFront ? 0.32 : 0.42;

    // Tire
    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 32);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92 });
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.castShadow = true;
    wheelGroup.add(tire);

    // Rim
    const rimRadius = isFront ? 0.18 : 0.2;
    const rimGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width + 0.01, 16);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.85, roughness: 0.1 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    wheelGroup.add(rim);

    // Rim spokes (5 spokes)
    for (let i = 0; i < 5; i++) {
        const spokeGeo = new THREE.BoxGeometry(width - 0.02, 0.03, rimRadius * 1.6);
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = (i / 5) * Math.PI;
        wheelGroup.add(spoke);
    }

    return wheelGroup;
}
