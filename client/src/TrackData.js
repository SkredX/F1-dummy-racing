export const TRACKS = {
    silverstone: {
        name: "Silverstone Circuit",
        length: 5891,
        // Simplified waypoints for generating a loop track
        path: [
            { x: 0, z: 0 }, { x: 0, z: -200 }, { x: 100, z: -300 }, // Copse
            { x: 300, z: -300 }, { x: 400, z: -200 }, // Maggots/Becketts
            { x: 400, z: 0 }, { x: 300, z: 200 }, // Stowe
            { x: 0, z: 200 }, { x: -100, z: 100 } // Vale/Club
        ]
    },
    monza: {
        name: "Autodromo Nazionale Monza",
        length: 5793,
        path: [
            { x: 0, z: 0 }, { x: 0, z: -500 }, // Main Straight
            { x: 100, z: -600 }, { x: 200, z: -500 }, // Curva Grande
            { x: 200, z: 0 }, { x: 100, z: 100 }  // Parabolica
        ]
    },
    spa: {
        name: "Circuit de Spa-Francorchamps",
        length: 7004,
        path: [
            { x: 0, z: 0 }, { x: 0, z: -100 }, // La Source
            { x: 50, z: -300 }, // Eau Rouge / Raidillon
            { x: 50, z: -800 }, // Kemmel Straight
            { x: 200, z: -900 }, { x: 200, z: -100 }, // Les Combes to Blanchimont
            { x: 100, z: 100 } // Bus Stop
        ]
    }
};
