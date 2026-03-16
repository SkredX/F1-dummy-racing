/**
 * TrackBuilder.js — Procedural 3D track geometry for the Monza circuit.
 * Generates road surface, kerbs, barriers, runoff areas, and environment.
 */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// ── Texture helpers ──
function createAsphaltTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Dark grey asphalt base
    ctx.fillStyle = '#3d3d3d';
    ctx.fillRect(0, 0, 512, 512);

    // Subtle grain noise for realistic asphalt
    for (let i = 0; i < 20000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = 0.5 + Math.random() * 1.5;
        const base = 45 + Math.random() * 35;
        ctx.fillStyle = `rgb(${base},${base},${base})`;
        ctx.fillRect(x, y, size, size);
    }

    // Occasional lighter aggregate specks
    for (let i = 0; i < 3000; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const v = 80 + Math.random() * 40;
        ctx.fillStyle = `rgba(${v},${v},${v}, 0.3)`;
        ctx.fillRect(x, y, 1, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 60);
    tex.anisotropy = 4;
    return tex;
}

function createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Rich green base
    ctx.fillStyle = '#2a7a2e';
    ctx.fillRect(0, 0, 256, 256);

    // Varied green blades
    for (let i = 0; i < 8000; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = 25 + Math.random() * 30;
        const g = 80 + Math.random() * 70;
        const b = 20 + Math.random() * 25;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1.5 + Math.random() * 2);
    }

    // Darker patches for depth
    for (let i = 0; i < 1500; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.fillStyle = `rgba(15, 60, 15, 0.25)`;
        ctx.fillRect(x, y, 3 + Math.random() * 4, 3 + Math.random() * 4);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(80, 80);
    tex.anisotropy = 4;
    return tex;
}

function createGravelTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Sandy/tan base
    ctx.fillStyle = '#c2a55a';
    ctx.fillRect(0, 0, 256, 256);

    // Individual gravel stones
    for (let i = 0; i < 6000; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const size = 1 + Math.random() * 3;
        const base = 140 + Math.random() * 80;
        const r = base;
        const g = base * (0.75 + Math.random() * 0.15);
        const b = base * (0.45 + Math.random() * 0.2);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
    }

    // Shadow between stones
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.fillStyle = `rgba(80, 60, 30, 0.2)`;
        ctx.fillRect(x, y, 1, 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(30, 30);
    tex.anisotropy = 4;
    return tex;
}

/**
 * Get the closed CatmullRom spline for track centerline
 */
export function getTrackSpline(trackData) {
    const points = trackData.path.map(p => new THREE.Vector3(p.x, p.y || 0, p.z));
    // Use true to close the loop seamlessly natively in Three.js.
    // Use 'centripetal' type to prevent self-intersecting loops and overshoots on tight F1 chicanes.
    return new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5);
}

/**
 * Build the entire track scene
 */
export function buildTrack(trackData, world, groundMaterial) {
    const result = { meshes: [], bodies: [], spline: null, miniMapPoints: [] };
    const trackWidth = trackData.trackWidth || 12;

    const spline = getTrackSpline(trackData);
    result.spline = spline;

    const numSamples = 1200;
    const splinePoints = spline.getSpacedPoints(numSamples);
    result.miniMapPoints = splinePoints.map(p => ({ x: p.x, z: p.z }));

    // ── Ground Plane (grass) ──
    const grassTex = createGrassTexture();
    const groundGeo = new THREE.PlaneGeometry(1200, 1200);
    const groundMat = new THREE.MeshStandardMaterial({
        map: grassTex,
        roughness: 0.92,
        color: 0x357a38
    });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = -0.5;
    groundMesh.receiveShadow = true;
    result.meshes.push(groundMesh);

    // Ground physics
    const groundBody = new CANNON.Body({ mass: 0, material: groundMaterial });
    groundBody.addShape(new CANNON.Plane());
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
    result.bodies.push(groundBody);

    // ── Road Surface ──
    result.meshes.push(buildRoadSurface(splinePoints, trackWidth, numSamples));

    // ── White Track Edge Lines ──
    buildEdgeLines(splinePoints, trackWidth, numSamples).forEach(m => result.meshes.push(m));

    // ── Kerbs ──
    buildKerbs(splinePoints, trackWidth, numSamples).forEach(m => result.meshes.push(m));

    // ── Gravel Runoff ──
    buildRunoff(splinePoints, trackWidth, numSamples).forEach(m => result.meshes.push(m));

    // ── Grass Strip (between gravel and outer grass) ──
    buildGrassStrips(splinePoints, trackWidth, numSamples).forEach(m => result.meshes.push(m));

    // ── Barriers ──
    const barrierResult = buildBarriers(splinePoints, trackWidth, numSamples, world, groundMaterial);
    barrierResult.meshes.forEach(m => result.meshes.push(m));
    barrierResult.bodies.forEach(b => result.bodies.push(b));

    // ── Start/Finish Gantry ──
    result.meshes.push(buildStartFinishGantry(splinePoints, trackWidth));

    // ── Grandstands ──
    if (trackData.grandstands) {
        trackData.grandstands.forEach(gs => result.meshes.push(buildGrandstand(gs)));
    }

    // ── Trees ──
    buildEnvironment(splinePoints, trackWidth).forEach(m => result.meshes.push(m));

    return result;
}

// ══════════════════════════════════════════════
// ── Road Surface ──
// ══════════════════════════════════════════════
function buildRoadSurface(points, width, numSamples) {
    const halfW = width / 2;
    const asphaltTex = createAsphaltTexture();

    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const normals = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= numSamples; i++) {
        const curr = points[i % points.length];
        const next = points[(i + 1) % points.length];
        const dir = new THREE.Vector3().subVectors(next, curr).normalize();
        const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

        const left = curr.clone().add(right.clone().multiplyScalar(-halfW));
        const rt = curr.clone().add(right.clone().multiplyScalar(halfW));

        vertices.push(left.x, curr.y + 0.01, left.z);
        vertices.push(rt.x, curr.y + 0.01, rt.z);
        normals.push(0, 1, 0, 0, 1, 0);

        const t = i / numSamples;
        uvs.push(0, t * 60);
        uvs.push(1, t * 60);
    }

    for (let i = 0; i < numSamples; i++) {
        const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
        indices.push(a, c, b);
        indices.push(b, c, d);
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);

    const material = new THREE.MeshStandardMaterial({
        map: asphaltTex,
        roughness: 0.7,
        metalness: 0.02,
        color: 0x4a4a4a,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
}

// ══════════════════════════════════════════════
// ── White Track Edge Lines ──
// ══════════════════════════════════════════════
function buildEdgeLines(points, width, numSamples) {
    const meshes = [];
    const halfW = width / 2;
    const lineWidth = 0.3;
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, side: THREE.DoubleSide });

    for (const side of [-1, 1]) {
        const geo = new THREE.BufferGeometry();
        const verts = [];
        const norms = [];
        const idx = [];

        for (let i = 0; i <= numSamples; i++) {
            const curr = points[i % points.length];
            const next = points[(i + 1) % points.length];
            const dir = new THREE.Vector3().subVectors(next, curr).normalize();
            const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

            const inner = curr.clone().add(right.clone().multiplyScalar(side * (halfW - lineWidth)));
            const outer = curr.clone().add(right.clone().multiplyScalar(side * halfW));

            verts.push(inner.x, curr.y + 0.015, inner.z);
            verts.push(outer.x, curr.y + 0.015, outer.z);
            norms.push(0, 1, 0, 0, 1, 0);
        }

        for (let i = 0; i < numSamples; i++) {
            const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
            idx.push(a, c, b);
            idx.push(b, c, d);
        }

        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
        geo.setIndex(idx);

        const mesh = new THREE.Mesh(geo, lineMat);
        mesh.receiveShadow = true;
        meshes.push(mesh);
    }

    return meshes;
}

// ══════════════════════════════════════════════
// ── Kerbs ──
// ══════════════════════════════════════════════
function buildKerbs(points, width, numSamples) {
    const meshes = [];
    const halfW = width / 2;
    const kerbWidth = 1.5;

    // Red and white alternating kerb texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const stripeH = 64;
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#cc1111' : '#eeeeee';
        ctx.fillRect(0, i * stripeH, 64, stripeH);
    }
    const kerbTex = new THREE.CanvasTexture(canvas);
    kerbTex.wrapS = kerbTex.wrapT = THREE.RepeatWrapping;
    kerbTex.repeat.set(1, 30);

    for (const side of [-1, 1]) {
        const geometry = new THREE.BufferGeometry();
        const verts = [];
        const norms = [];
        const uv = [];
        const idx = [];

        for (let i = 0; i <= numSamples; i++) {
            const curr = points[i % points.length];
            const next = points[(i + 1) % points.length];
            const dir = new THREE.Vector3().subVectors(next, curr).normalize();
            const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

            const inner = curr.clone().add(right.clone().multiplyScalar(side * halfW));
            const outer = curr.clone().add(right.clone().multiplyScalar(side * (halfW + kerbWidth)));

            // Slight raised edge for realism
            verts.push(inner.x, curr.y + 0.02, inner.z);
            verts.push(outer.x, curr.y + 0.06, outer.z);
            norms.push(0, 1, 0, 0, 1, 0);

            const t = i / numSamples;
            uv.push(0, t * 30);
            uv.push(1, t * 30);
        }

        for (let i = 0; i < numSamples; i++) {
            const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
            idx.push(a, c, b);
            idx.push(b, c, d);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(idx);

        const mat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.55, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.receiveShadow = true;
        meshes.push(mesh);
    }

    return meshes;
}

// ══════════════════════════════════════════════
// ── Gravel Runoff ──
// ══════════════════════════════════════════════
function buildRunoff(points, width, numSamples) {
    const meshes = [];
    const halfW = width / 2;
    const kerbWidth = 1.5;
    const runoffWidth = 8;
    const gravelTex = createGravelTexture();

    for (const side of [-1, 1]) {
        const geometry = new THREE.BufferGeometry();
        const verts = [];
        const norms = [];
        const uv = [];
        const idx = [];

        for (let i = 0; i <= numSamples; i++) {
            const curr = points[i % points.length];
            const next = points[(i + 1) % points.length];
            const dir = new THREE.Vector3().subVectors(next, curr).normalize();
            const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

            const inner = curr.clone().add(right.clone().multiplyScalar(side * (halfW + kerbWidth)));
            const outer = curr.clone().add(right.clone().multiplyScalar(side * (halfW + kerbWidth + runoffWidth)));

            verts.push(inner.x, -0.01, inner.z);
            verts.push(outer.x, -0.02, outer.z);
            norms.push(0, 1, 0, 0, 1, 0);

            const t = i / numSamples;
            uv.push(0, t * 20);
            uv.push(1, t * 20);
        }

        for (let i = 0; i < numSamples; i++) {
            const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
            idx.push(a, c, b);
            idx.push(b, c, d);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(idx);

        const mat = new THREE.MeshStandardMaterial({
            map: gravelTex,
            roughness: 0.95,
            color: 0xc8a95e,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.receiveShadow = true;
        meshes.push(mesh);
    }

    return meshes;
}

// ══════════════════════════════════════════════
// ── Grass Strips (between gravel and outer field) ──
// ══════════════════════════════════════════════
function buildGrassStrips(points, width, numSamples) {
    const meshes = [];
    const halfW = width / 2;
    const kerbWidth = 1.5;
    const runoffWidth = 8;
    const grassStripWidth = 6;
    const grassTex = createGrassTexture();

    for (const side of [-1, 1]) {
        const geometry = new THREE.BufferGeometry();
        const verts = [];
        const norms = [];
        const uv = [];
        const idx = [];

        for (let i = 0; i <= numSamples; i++) {
            const curr = points[i % points.length];
            const next = points[(i + 1) % points.length];
            const dir = new THREE.Vector3().subVectors(next, curr).normalize();
            const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

            const innerOffset = halfW + kerbWidth + runoffWidth;
            const inner = curr.clone().add(right.clone().multiplyScalar(side * innerOffset));
            const outer = curr.clone().add(right.clone().multiplyScalar(side * (innerOffset + grassStripWidth)));

            verts.push(inner.x, -0.03, inner.z);
            verts.push(outer.x, -0.04, outer.z);
            norms.push(0, 1, 0, 0, 1, 0);

            const t = i / numSamples;
            uv.push(0, t * 15);
            uv.push(1, t * 15);
        }

        for (let i = 0; i < numSamples; i++) {
            const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
            idx.push(a, c, b);
            idx.push(b, c, d);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geometry.setIndex(idx);

        const mat = new THREE.MeshStandardMaterial({
            map: grassTex,
            roughness: 0.9,
            color: 0x3d8c40,
            side: THREE.DoubleSide
        });
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.receiveShadow = true;
        meshes.push(mesh);
    }

    return meshes;
}

// ══════════════════════════════════════════════
// ── Barriers ──
// ══════════════════════════════════════════════
function buildBarriers(points, width, numSamples, world, groundMaterial) {
    const result = { meshes: [], bodies: [] };
    const halfW = width / 2;
    const barrierOffset = halfW + 10; // Distance from center
    const barrierHeight = 1.2;
    const fenceHeight = 3.5; // Height of the FIA catch-fence

    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.8 });
    
    // Simulate chain-link fence with a dark, slightly transparent wireframe-like material
    const fenceMat = new THREE.MeshStandardMaterial({ 
        color: 0x222222, 
        wireframe: true, 
        transparent: true, 
        opacity: 0.6,
        side: THREE.DoubleSide
    });

    for (const side of [-1, 1]) {
        const wallGeo = new THREE.BufferGeometry();
        const fenceGeo = new THREE.BufferGeometry();
        const wallVerts = [], fenceVerts = [], idx = [];

        for (let i = 0; i <= numSamples; i++) {
            const curr = points[i % points.length];
            const next = points[(i + 1) % points.length];
            const dir = new THREE.Vector3().subVectors(next, curr).normalize();
            const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

            const pos = curr.clone().add(right.clone().multiplyScalar(side * barrierOffset));

            // Wall Vertices
            wallVerts.push(pos.x, curr.y, pos.z);
            wallVerts.push(pos.x, curr.y + barrierHeight, pos.z);

            // Fence Vertices (starts at top of wall)
            fenceVerts.push(pos.x, curr.y + barrierHeight, pos.z);
            fenceVerts.push(pos.x, curr.y + barrierHeight + fenceHeight, pos.z);
        }

        for (let i = 0; i < numSamples; i++) {
            const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
            idx.push(a, c, b);
            idx.push(b, c, d);
        }

        wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallVerts, 3));
        wallGeo.setIndex(idx);
        fenceGeo.setAttribute('position', new THREE.Float32BufferAttribute(fenceVerts, 3));
        fenceGeo.setIndex(idx);

        wallGeo.computeVertexNormals();
        fenceGeo.computeVertexNormals();

        const wallMesh = new THREE.Mesh(wallGeo, concreteMat);
        const fenceMesh = new THREE.Mesh(fenceGeo, fenceMat);
        
        wallMesh.castShadow = true; wallMesh.receiveShadow = true;
        
        result.meshes.push(wallMesh, fenceMesh);

        // 2. Build Physics bodies (using slightly larger steps to save CPU, but they will overlap cleanly)
        const physStep = 10; 
        for (let i = 0; i < numSamples; i += physStep) {
            const curr = points[i % points.length];
            const next = points[(i + physStep) % points.length];
            const dir = new THREE.Vector3().subVectors(next, curr);
            const segLen = dir.length();
            dir.normalize();
            const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

            const pos = curr.clone().add(dir.clone().multiplyScalar(segLen / 2));
            pos.add(right.clone().multiplyScalar(side * barrierOffset));

            const body = new CANNON.Body({
                mass: 0,
                material: groundMaterial,
                position: new CANNON.Vec3(pos.x, barrierHeight / 2, pos.z)
            });

            const angle = Math.atan2(dir.x, dir.z);
            body.quaternion.setFromEuler(0, angle, 0);
            // Overlap segments slightly (+0.5) to prevent physics snagging
            body.addShape(new CANNON.Box(new CANNON.Vec3(0.6, barrierHeight / 2, (segLen / 2) + 0.5)));

            world.addBody(body);
            result.bodies.push(body);
        }
    }

    return result;
}

// ══════════════════════════════════════════════
// ── Start/Finish Gantry ──
// ══════════════════════════════════════════════
function buildStartFinishGantry(points, width) {
    const group = new THREE.Group();
    const pos = points[0];
    const next = points[1];
    const dir = new THREE.Vector3().subVectors(next, pos).normalize();
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();

    const gantryWidth = width + 8;

    // Pillars (steel grey)
    const pillarGeo = new THREE.BoxGeometry(0.6, 12, 0.6);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x707070, metalness: 0.8, roughness: 0.2 });

    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(pos.x + right.x * (-gantryWidth / 2), 6, pos.z + right.z * (-gantryWidth / 2));
    leftPillar.castShadow = true;
    group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(pos.x + right.x * (gantryWidth / 2), 6, pos.z + right.z * (gantryWidth / 2));
    rightPillar.castShadow = true;
    group.add(rightPillar);

    // Cross beam
    const beamGeo = new THREE.BoxGeometry(gantryWidth, 1.8, 2.5);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.6, roughness: 0.3 });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(pos.x, 11, pos.z);
    const angle = Math.atan2(right.x, right.z);
    beam.rotation.y = angle;
    beam.castShadow = true;
    group.add(beam);

    // Checkered pattern on beam
    const checkerCanvas = document.createElement('canvas');
    checkerCanvas.width = 128;
    checkerCanvas.height = 32;
    const ctx = checkerCanvas.getContext('2d');
    const sq = 16;
    for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 8; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? '#000000' : '#ffffff';
            ctx.fillRect(c * sq, r * sq, sq, sq);
        }
    }
    const checkerTex = new THREE.CanvasTexture(checkerCanvas);
    const checkerGeo = new THREE.PlaneGeometry(gantryWidth * 0.85, 1.4);
    const checkerMat = new THREE.MeshStandardMaterial({ map: checkerTex, side: THREE.DoubleSide });
    const checkerPlane = new THREE.Mesh(checkerGeo, checkerMat);
    checkerPlane.position.set(pos.x, 11, pos.z + 1.3);
    checkerPlane.rotation.y = angle;
    group.add(checkerPlane);

    // Start/finish line on ground (white with black squares)
    const lineCanvas = document.createElement('canvas');
    lineCanvas.width = 128;
    lineCanvas.height = 16;
    const lctx = lineCanvas.getContext('2d');
    for (let c = 0; c < 8; c++) {
        lctx.fillStyle = c % 2 === 0 ? '#ffffff' : '#222222';
        lctx.fillRect(c * 16, 0, 16, 16);
    }
    const lineTex = new THREE.CanvasTexture(lineCanvas);

    const lineGeo = new THREE.PlaneGeometry(width, 2.5);
    const lineMat2 = new THREE.MeshStandardMaterial({ map: lineTex, side: THREE.DoubleSide, roughness: 0.5 });
    const line = new THREE.Mesh(lineGeo, lineMat2);
    line.rotation.x = -Math.PI / 2;
    line.position.set(pos.x, 0.03, pos.z);
    line.rotation.z = angle;
    group.add(line);

    return group;
}

// ══════════════════════════════════════════════
// ── Grandstands ──
// ══════════════════════════════════════════════
function buildGrandstand(gs) {
    const group = new THREE.Group();
    const len = gs.length || 50;
    const depth = 10;
    const height = 7;
    const tiers = 5;

    // Concrete structure
    const structMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });

    for (let t = 0; t < tiers; t++) {
        const tierGeo = new THREE.BoxGeometry(len, 0.3, depth / tiers);
        const tier = new THREE.Mesh(tierGeo, structMat);
        tier.position.set(0, t * (height / tiers), t * (depth / tiers) / 2);
        tier.castShadow = true;
        tier.receiveShadow = true;
        group.add(tier);
    }

    // Roof
    const roofGeo = new THREE.BoxGeometry(len + 3, 0.25, depth + 3);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.3 });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, height + 0.5, depth / 2);
    roof.castShadow = true;
    group.add(roof);

    // Colored seat blocks (simpler, fewer meshes for performance)
    const seatColors = [0xcc0000, 0xdd4400, 0xddaa00, 0x008800, 0x0044cc];
    for (let t = 0; t < tiers; t++) {
        const seatGeo = new THREE.BoxGeometry(len - 2, 0.5, (depth / tiers) * 0.6);
        const seatMat = new THREE.MeshStandardMaterial({
            color: seatColors[t % seatColors.length],
            roughness: 0.6
        });
        const seats = new THREE.Mesh(seatGeo, seatMat);
        seats.position.set(0, t * (height / tiers) + 0.4, t * (depth / tiers) / 2);
        group.add(seats);
    }

    group.position.set(gs.x, 0, gs.z);
    group.rotation.y = gs.rotation || 0;
    return group;
}

// ══════════════════════════════════════════════
// ── Environment Trees (Corrected) ──
// ══════════════════════════════════════════════
function buildEnvironment(points, width) {
    const meshes = [];
    const treeCount = 600;
    const safeDistance = (width / 2) + 20; // Ensure trees do not spawn on asphalt or gravel

    // Simple low-poly tree geometry
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.7, 3, 5);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e00 });
    const leavesGeo = new THREE.ConeGeometry(3, 6, 5);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1e4f16 });

    let treesPlaced = 0;
    let attempts = 0; // Prevent infinite loops during generation

    while (treesPlaced < treeCount && attempts < 2000) {
        attempts++;
        
        // Generate random position across the map
        const x = (Math.random() - 0.5) * 800;
        const z = (Math.random() - 0.5) * 800;

        // Check distance to the closest track point
        let isSafe = true;
        // Step by 5 to save CPU during generation
        for (let i = 0; i < points.length; i += 5) { 
            const pt = points[i];
            const dist = Math.hypot(pt.x - x, pt.z - z);
            if (dist < safeDistance) {
                isSafe = false;
                break;
            }
        }

        if (isSafe) {
            // Build tree
            const treeGroup = new THREE.Group();
            
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 1.5; 
            trunk.castShadow = true;
            
            const leaves = new THREE.Mesh(leavesGeo, leavesMat);
            leaves.position.y = 4.5; 
            leaves.castShadow = true;

            treeGroup.add(trunk);
            treeGroup.add(leaves);
            
            treeGroup.position.set(x, 0, z);
            
            // Randomize scale for variety
            const scale = 0.8 + Math.random() * 0.6;
            treeGroup.scale.set(scale, scale, scale);

            meshes.push(treeGroup);
            treesPlaced++;
        }
    }
    
    return meshes;
}