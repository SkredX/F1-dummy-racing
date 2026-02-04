import * as THREE from 'three';

export class LapTimer {
    constructor(startLinePosition, startLineRadius) {
        this.startLinePos = new THREE.Vector3(startLinePosition.x, 0, startLinePosition.z);
        this.checkRadius = startLineRadius || 10;

        this.currentLap = 0;
        this.startTime = 0;
        this.lastLapTime = 0;
        this.bestLapTime = Infinity;

        this.onCooldown = false; // Prevent double triggering

        // UI Elements
        this.uiCurrent = document.createElement('div');
        this.uiCurrent.id = 'lap-current';
        this.uiBest = document.createElement('div');
        this.uiBest.id = 'lap-best';
        this.uiLast = document.createElement('div');
        this.uiLast.id = 'lap-last';

        const container = document.getElementById('ui-container');
        // Basic styling injection
        const style = document.createElement('style');
        style.textContent = `
            #lap-stats { position: absolute; top: 20px; left: 20px; color: width; font-family: monospace; }
            .lap-text { font-size: 24px; color: #fff; text-shadow: 1px 1px 2px black; margin-bottom: 5px; }
            .lap-label { color: #aaa; font-size: 16px; }
        `;
        document.head.appendChild(style);

        const statsContainer = document.createElement('div');
        statsContainer.id = 'lap-stats';
        statsContainer.appendChild(this.uiCurrent);
        statsContainer.appendChild(this.uiLast);
        statsContainer.appendChild(this.uiBest);
        container.appendChild(statsContainer);
    }

    update(carPosition, time) {
        // Calculate distance to start/finish line
        // Simplified: just distance check. Ideal: Plane intersection.
        const dist = this.startLinePos.distanceTo(new THREE.Vector3(carPosition.x, 0, carPosition.z));

        if (dist < this.checkRadius && !this.onCooldown) {
            this.completeLap(time);
            this.onCooldown = true;
            setTimeout(() => { this.onCooldown = false; }, 5000); // 5 sec cooldown (min lap time)
        }

        if (this.currentLap > 0) {
            const lapTime = (time - this.startTime) / 1000;
            this.uiCurrent.innerHTML = `<span class="lap-label">Current:</span> ${this.formatTime(lapTime)}`;
        } else {
            this.uiCurrent.innerHTML = `<span class="lap-label">Current:</span> 00:00.000`;
        }
    }

    completeLap(time) {
        if (this.currentLap > 0) {
            const lapTime = (time - this.startTime) / 1000;
            this.lastLapTime = lapTime;

            if (lapTime < this.bestLapTime) {
                this.bestLapTime = lapTime;
            }

            this.uiLast.innerHTML = `<span class="lap-label">Last:</span> ${this.formatTime(this.lastLapTime)}`;
            this.uiBest.innerHTML = `<span class="lap-label">Best:</span> ${this.formatTime(this.bestLapTime)}`;
        }

        this.currentLap++;
        this.startTime = time;
        console.log("Lap " + this.currentLap + " started!");
    }

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds * 1000) % 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
}
