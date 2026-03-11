/**
 * TrackData.js — Accurate Monza circuit layout with GPS-referenced control points.
 * Coordinates are in meters, scaled to approximate the real 5.793km layout.
 * Y values represent elevation changes.
 */

export const TRACKS = {
    monza: {
        name: "Autodromo Nazionale Monza",
        length: 5793,
        trackWidth: 12,
        // Start/finish line position
        startFinish: { x: 0, z: 0 },
        // Starting grid position and direction
        startPosition: { x: -1, y: 0.6, z: -30 },
        startRotation: 0, // radians, facing +Z along the main straight

        // Sector boundary indices (index into path array)
        sectors: {
            s1End: 18,  // End of sector 1 (after Lesmo 2)
            s2End: 30,  // End of sector 2 (after Ascari)
        },

        // Detailed path — Monza circuit control points (clockwise as driven)
        // Each point: { x, z, y (elevation), w (optional width override) }
        path: [
            // ═══ Start/Finish Straight ═══
            { x: 0, z: 0, y: 0 },
            { x: 0, z: 40, y: 0 },
            { x: 0, z: 90, y: 0 },
            { x: 0, z: 140, y: 0 },

            // ═══ Variante del Rettifilo (1st Chicane) ═══
            { x: 8, z: 175, y: 0 },
            { x: 18, z: 195, y: 0 },
            { x: 12, z: 215, y: 0 },
            { x: 0, z: 235, y: 0 },

            // ═══ Run to Curva Grande ═══
            { x: -5, z: 270, y: 0 },
            { x: -8, z: 310, y: 0 },

            // ═══ Curva Grande (long right-hander) ═══
            { x: -5, z: 360, y: 0 },
            { x: 15, z: 410, y: 0 },
            { x: 50, z: 440, y: 0 },
            { x: 90, z: 445, y: 0 },

            // ═══ Variante della Roggia (2nd Chicane) ═══
            { x: 120, z: 435, y: 0 },
            { x: 135, z: 415, y: 0 },
            { x: 128, z: 395, y: 0 },
            { x: 115, z: 378, y: 0 },

            // ═══ Lesmo 1 ═══
            { x: 110, z: 345, y: 0.5 },
            { x: 115, z: 310, y: 1 },
            { x: 130, z: 280, y: 1.5 },

            // ═══ Lesmo 2 ═══
            { x: 148, z: 255, y: 1.5 },
            { x: 160, z: 230, y: 1 },
            { x: 165, z: 200, y: 0.5 },

            // ═══ Run down to Variante Ascari ═══
            { x: 162, z: 160, y: 0 },
            { x: 155, z: 120, y: -0.5 },

            // ═══ Variante Ascari ═══
            { x: 140, z: 90, y: -0.5 },
            { x: 120, z: 72, y: -0.5 },
            { x: 108, z: 58, y: -0.5 },
            { x: 105, z: 40, y: 0 },
            { x: 115, z: 20, y: 0 },

            // ═══ Straight before Parabolica ═══
            { x: 118, z: -10, y: 0 },
            { x: 115, z: -50, y: 0 },
            { x: 110, z: -90, y: 0 },

            // ═══ Curva Parabolica (Curva Alboreto) ═══
            { x: 100, z: -125, y: 0 },
            { x: 82, z: -150, y: 0 },
            { x: 60, z: -165, y: 0 },
            { x: 35, z: -170, y: 0 },
            { x: 10, z: -165, y: 0 },

            // ═══ Main Straight (back to start/finish) ═══
            { x: -5, z: -140, y: 0 },
            { x: -5, z: -100, y: 0 },
            { x: -3, z: -60, y: 0 },
            { x: -1, z: -30, y: 0 },
        ],

        // Corner names for the mini-map labels
        corners: [
            { name: "Rettifilo", pathIndex: 5 },
            { name: "Curva Grande", pathIndex: 11 },
            { name: "Roggia", pathIndex: 15 },
            { name: "Lesmo 1", pathIndex: 18 },
            { name: "Lesmo 2", pathIndex: 22 },
            { name: "Ascari", pathIndex: 27 },
            { name: "Parabolica", pathIndex: 35 },
        ],

        // DRS zones (indices into path)
        drsZones: [
            { start: 0, end: 3 },      // Main straight
            { start: 7, end: 9 },       // After chicane 1
        ],

        // Grandstand locations (for environment)
        grandstands: [
            { x: 20, z: 50, rotation: Math.PI / 2, length: 80 },
            { x: -20, z: 50, rotation: -Math.PI / 2, length: 80 },
            { x: 20, z: 195, rotation: 0, length: 40 },
            { x: 100, z: -170, rotation: 0, length: 50 },
        ],
    }
};
