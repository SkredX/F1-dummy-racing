import * as THREE from 'three';

/**
 * LapTimer.js — F1-style lap timing with sector splits, delta tracking,
 * and formatted time display.
 */
export class LapTimer {
    constructor(startLinePosition, checkRadius, sectors, trackSpline, miniMapPoints) {
        this.startLinePos = new THREE.Vector3(startLinePosition.x, 0, startLinePosition.z || startLinePosition.y || 0);
        this.checkRadius = checkRadius || 12;

        this.currentLap = 0;
        this.startTime = 0;
        this.lastLapTime = 0;
        this.bestLapTime = Infinity;
        this.lapTimes = [];

        this.onCooldown = false;

        // Sector tracking
        this.sectors = sectors || {};
        this.trackSpline = trackSpline;
        this.currentSector = 1;
        this.sectorTimes = { s1: 0, s2: 0, s3: 0 };
        this.bestSectorTimes = { s1: Infinity, s2: Infinity, s3: Infinity };
        this.sectorStartTime = 0;

        // Build sector gate positions from spline
        this.sectorGates = [];
        if (trackSpline && sectors) {
            const totalPts = miniMapPoints?.length || 1200;
            if (sectors.s1End) {
                const t1 = sectors.s1End / 42; // approximate ratio
                const p1 = trackSpline.getPointAt(Math.min(t1, 0.99));
                this.sectorGates.push({ pos: new THREE.Vector3(p1.x, 0, p1.z), sector: 1 });
            }
            if (sectors.s2End) {
                const t2 = sectors.s2End / 42;
                const p2 = trackSpline.getPointAt(Math.min(t2, 0.99));
                this.sectorGates.push({ pos: new THREE.Vector3(p2.x, 0, p2.z), sector: 2 });
            }
        }

        this._buildUI();
    }

    _buildUI() {
        const container = document.getElementById('ui-container');
        if (!container) return;

        // Remove old lap-stats if exists
        const old = document.getElementById('lap-stats');
        if (old) old.remove();

        const statsContainer = document.createElement('div');
        statsContainer.id = 'lap-stats';
        statsContainer.innerHTML = `
            <div class="lap-stat-row" id="lap-current">
                <span class="lap-stat-label">CURRENT</span>
                <span class="lap-stat-value" id="current-time">00:00.000</span>
            </div>
            <div class="lap-stat-row" id="lap-last">
                <span class="lap-stat-label">LAST</span>
                <span class="lap-stat-value" id="last-time">--:--.---</span>
            </div>
            <div class="lap-stat-row" id="lap-best">
                <span class="lap-stat-label">BEST</span>
                <span class="lap-stat-value best-val" id="best-time">--:--.---</span>
            </div>
            <div class="sector-row" id="sector-display">
                <span class="sector-badge" id="s1-badge">S1</span>
                <span class="sector-badge" id="s2-badge">S2</span>
                <span class="sector-badge" id="s3-badge">S3</span>
            </div>
            <div class="lap-stat-row" id="delta-row">
                <span class="lap-stat-label">DELTA</span>
                <span class="lap-stat-value" id="delta-time">+0.000</span>
            </div>
        `;
        container.appendChild(statsContainer);
    }

    update(carPosition, time) {
        const carPos2D = new THREE.Vector3(carPosition.x, 0, carPosition.z);
        const dist = this.startLinePos.distanceTo(carPos2D);

        // Track maximum distance from start/finish (must go far enough for a valid lap)
        if (!this.maxDistFromStart) this.maxDistFromStart = 0;
        this.maxDistFromStart = Math.max(this.maxDistFromStart, dist);

        // Check start/finish line crossing — require minimum 200m travel from start
        const minLapDistance = 200;
        if (dist < this.checkRadius && !this.onCooldown && this.maxDistFromStart > minLapDistance) {
            this.completeLap(time);
            this.onCooldown = true;
            this.maxDistFromStart = 0; // Reset distance tracking
            setTimeout(() => { this.onCooldown = false; }, 15000); // 15s cooldown
        }

        // First lap: just need to cross the line once (no distance check)
        if (this.currentLap === 0 && dist < this.checkRadius && !this.onCooldown) {
            this.completeLap(time);
            this.onCooldown = true;
            setTimeout(() => { this.onCooldown = false; }, 15000);
        }

        // Check sector gates
        this.sectorGates.forEach(gate => {
            const gDist = gate.pos.distanceTo(carPos2D);
            if (gDist < 15 && !gate.cooldown) {
                this._completeSector(gate.sector, time);
                gate.cooldown = true;
                setTimeout(() => { gate.cooldown = false; }, 5000);
            }
        });

        // Update current time display
        if (this.currentLap > 0) {
            const elapsed = (time - this.startTime) / 1000;
            const el = document.getElementById('current-time');
            if (el) el.innerText = this.formatTime(elapsed);

            // Delta calculation
            if (this.bestLapTime < Infinity) {
                const delta = elapsed - this.bestLapTime;
                const deltaEl = document.getElementById('delta-time');
                if (deltaEl) {
                    const prefix = delta >= 0 ? '+' : '';
                    deltaEl.innerText = prefix + delta.toFixed(3);
                    deltaEl.className = 'lap-stat-value ' + (delta <= 0 ? 'delta-green' : 'delta-red');
                }
            }
        }
    }

    _completeSector(sectorNum, time) {
        const sectorTime = (time - this.sectorStartTime) / 1000;
        const key = `s${sectorNum}`;
        this.sectorTimes[key] = sectorTime;

        const badge = document.getElementById(`s${sectorNum}-badge`);
        if (badge) {
            if (sectorTime < this.bestSectorTimes[key]) {
                this.bestSectorTimes[key] = sectorTime;
                badge.className = 'sector-badge sector-purple';
            } else if (sectorTime < this.bestSectorTimes[key] * 1.02) {
                badge.className = 'sector-badge sector-green';
            } else {
                badge.className = 'sector-badge sector-yellow';
            }
        }

        this.sectorStartTime = time;
        this.currentSector = sectorNum + 1;
    }

    completeLap(time) {
        if (this.currentLap > 0) {
            const lapTime = (time - this.startTime) / 1000;
            this.lastLapTime = lapTime;
            this.lapTimes.push(lapTime);

            // Last lap display
            const lastEl = document.getElementById('last-time');
            if (lastEl) lastEl.innerText = this.formatTime(this.lastLapTime);

            if (lapTime < this.bestLapTime) {
                this.bestLapTime = lapTime;
                const bestEl = document.getElementById('best-time');
                if (bestEl) bestEl.innerText = this.formatTime(this.bestLapTime);
            }
        }

        this.currentLap++;
        this.startTime = time;
        this.sectorStartTime = time;
        this.currentSector = 1;

        // Reset sector badges
        for (let s = 1; s <= 3; s++) {
            const badge = document.getElementById(`s${s}-badge`);
            if (badge) badge.className = 'sector-badge';
        }
    }

    formatTime(seconds) {
        if (seconds === Infinity || isNaN(seconds)) return '--:--.---';
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        const ms = Math.floor((seconds * 1000) % 1000);
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
}
