import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function createF1CarMesh(teamColor) {
    // 1. Create a container group that returns immediately for Game.js to use
    const carGroup = new THREE.Group();

    // 2. Load the GLTF model asynchronously
    const loader = new GLTFLoader();
    loader.load(
        '/rb20/rb20.gltf', // Path relative to the public/ folder
        (gltf) => {
            const model = gltf.scene;
            
            // Apply the exact transforms your friend used to align it with the physics body
            model.scale.set(2.2, 2.2, 2.2);
            model.position.set(0, -0.4, 0); 
            model.rotation.y = 0;

            // Enable shadows for the loaded model
            model.traverse((child) => {
                if (child.isMesh) {
                    console.log('Found mesh named:', child.name);
                    child.castShadow = true;
                    child.receiveShadow = true;
                    
                    // Fix color space for textures
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(mat => {
                            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
                            mat.needsUpdate = true;
                        });
                    }
                }
            });

            // Add the loaded model to our physics-tracked group
            carGroup.add(model);
        },
        undefined,
        (err) => {
            console.error('Failed to load RB20 model:', err);
        }
    );

    return carGroup;
}

export function createWheelMesh(isFront = true) {
    const wheelGroup = new THREE.Group();

    // NOTE: The RaycastVehicle creates separate physics wheels. 
    // Since the GLTF model likely already has static wheels attached to the chassis, 
    // rendering these procedural wheels will cause ugly overlapping. 
    // We create the meshes so Game.js doesn't crash, but we make them invisible.
    
    const radius = isFront ? 0.33 : 0.35;
    const width = isFront ? 0.32 : 0.42;

    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 32);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92 });
    const tire = new THREE.Mesh(tireGeo, tireMat);
    
    wheelGroup.add(tire);
    
    // Hide the procedural wheels to let the GLTF visuals take over
    wheelGroup.visible = false;

    return wheelGroup;
}