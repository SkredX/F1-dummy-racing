export const TRACKS = {
    monza: {
        name: "Autodromo Nazionale Monza",
        length: 5793,
        trackWidth: 12,
        startFinish: { x: 0, z: 0 },
        startPosition: { x: -1, y: 0.6, z: -30 },
        startRotation: 0, 

        sectors: {
            s1End: 23, 
            s2End: 36, 
        },

        // Densely clustered points force realistic, sharp F1 corners
        path: [
            // ═══ Start/Finish Straight ═══
            { x: 0, z: 0, y: 0 },
            { x: 0, z: 80, y: 0 },
            { x: 0, z: 160, y: 0 },
            { x: 0, z: 240, y: 0 },

            // ═══ Variante del Rettifilo (1st Chicane) ═══
            { x: 0, z: 270, y: 0 },
            { x: 12, z: 275, y: 0 }, // Right turn-in
            { x: 15, z: 282, y: 0 }, // Right apex
            { x: 6, z: 288, y: 0 },  // Left apex
            { x: 0, z: 295, y: 0 },  // Exit

            // ═══ Curva Grande (long right-hander) ═══
            { x: -8, z: 350, y: 0 },
            { x: -5, z: 420, y: 0 },
            { x: 15, z: 480, y: 0 },
            { x: 45, z: 530, y: 0 },
            { x: 85, z: 560, y: 0 },
            { x: 130, z: 575, y: 0 },

            // ═══ Variante della Roggia (2nd Chicane) ═══
            { x: 160, z: 578, y: 0 },
            { x: 175, z: 575, y: 0 }, // Braking
            { x: 182, z: 565, y: 0 }, // Left turn-in
            { x: 178, z: 555, y: 0 }, // Right apex
            { x: 172, z: 545, y: 0 }, // Exit

            // ═══ Lesmo 1 ═══
            { x: 165, z: 500, y: 0.5 },
            { x: 162, z: 470, y: 1 },
            { x: 175, z: 450, y: 1.5 },
            { x: 190, z: 440, y: 1.5 },

            // ═══ Lesmo 2 ═══
            { x: 210, z: 420, y: 1.5 },
            { x: 220, z: 395, y: 1 },
            { x: 215, z: 370, y: 0.5 },
            { x: 200, z: 345, y: 0 },

            // ═══ Run down to Variante Ascari ═══
            { x: 185, z: 290, y: -0.5 },
            { x: 170, z: 230, y: -0.5 },
            { x: 155, z: 170, y: -0.5 },

            // ═══ Variante Ascari ═══
            { x: 145, z: 130, y: -0.5 }, // Braking
            { x: 132, z: 115, y: -0.5 }, // Left
            { x: 138, z: 105, y: 0 },    // Right
            { x: 125, z: 92, y: 0 },     // Left
            { x: 115, z: 80, y: 0 },     // Exit

            // ═══ Straight before Parabolica ═══
            { x: 115, z: 30, y: 0 },
            { x: 115, z: -30, y: 0 },
            { x: 115, z: -90, y: 0 },

            // ═══ Curva Parabolica (Curva Alboreto) ═══
            { x: 115, z: -140, y: 0 },
            { x: 110, z: -175, y: 0 },
            { x: 90, z: -205, y: 0 },
            { x: 60, z: -220, y: 0 },
            { x: 25, z: -215, y: 0 },
            { x: 5, z: -190, y: 0 },

            // ═══ Main Straight (back to start/finish) ═══
            { x: 0, z: -140, y: 0 },
            { x: 0, z: -70, y: 0 },
        ],

        corners: [
            { name: "Rettifilo", pathIndex: 5 },
            { name: "Curva Grande", pathIndex: 12 },
            { name: "Roggia", pathIndex: 17 },
            { name: "Lesmo 1", pathIndex: 22 },
            { name: "Lesmo 2", pathIndex: 26 },
            { name: "Ascari", pathIndex: 32 },
            { name: "Parabolica", pathIndex: 40 },
        ],

        drsZones: [
            { start: 0, end: 4 },       // Main straight
            { start: 26, end: 30 },     // Straight after Lesmo 2
        ],

        grandstands: [
            // Main Straight Right
            { x: 25, z: 120, rotation: Math.PI / 2, length: 120 },
            // Main Straight Left
            { x: -25, z: 120, rotation: -Math.PI / 2, length: 120 },
            // Rettifilo Chicane Viewing
            { x: 35, z: 275, rotation: Math.PI / 2.5, length: 60 },
            // Parabolica Outside
            { x: 140, z: -175, rotation: Math.PI / 4, length: 70 },
        ],
    }
};