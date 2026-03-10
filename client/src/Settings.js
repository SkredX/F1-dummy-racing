/**
 * Settings.js — Rebindable controls system with presets and localStorage persistence.
 */

const STORAGE_KEY = 'f1-controls';

const PRESETS = {
    wasd: {
        label: 'WASD (Default)',
        bindings: {
            throttle: 'w',
            brake: 's',
            steerLeft: 'a',
            steerRight: 'd',
            drs: 'f',
            resetCar: 'r'
        }
    },
    arrows: {
        label: 'Arrow Keys',
        bindings: {
            throttle: 'arrowup',
            brake: 'arrowdown',
            steerLeft: 'arrowleft',
            steerRight: 'arrowright',
            drs: 'shift',
            resetCar: 'r'
        }
    }
};

const ACTION_LABELS = {
    throttle: 'Throttle',
    brake: 'Brake',
    steerLeft: 'Steer Left',
    steerRight: 'Steer Right',
    drs: 'DRS Toggle',
    resetCar: 'Reset Car'
};

function getKeyDisplayName(key) {
    const map = {
        ' ': 'Space',
        'arrowup': '↑',
        'arrowdown': '↓',
        'arrowleft': '←',
        'arrowright': '→',
        'shift': 'Shift',
        'control': 'Ctrl',
        'alt': 'Alt',
        'tab': 'Tab',
        'enter': 'Enter',
        'escape': 'Esc',
        'backspace': 'Backspace'
    };
    return map[key] || key.toUpperCase();
}

export class Settings {
    constructor() {
        this.bindings = { ...PRESETS.wasd.bindings };
        this.activePreset = 'wasd';
        this._listeners = [];
        this._load();
        this._buildUI();
    }

    /** Get current key bindings */
    getBindings() {
        return { ...this.bindings };
    }

    /** Check if a given key matches an action */
    isAction(action, keyLower) {
        return this.bindings[action] === keyLower;
    }

    /** Set a single binding */
    setBinding(action, key) {
        const keyLower = key.toLowerCase();
        // Remove duplicate — if another action has this key, unset it
        for (const a in this.bindings) {
            if (this.bindings[a] === keyLower && a !== action) {
                this.bindings[a] = '';
            }
        }
        this.bindings[action] = keyLower;
        this.activePreset = 'custom';
        this._save();
        this._refreshUI();
        this._notify();
    }

    /** Apply a preset */
    applyPreset(presetId) {
        if (PRESETS[presetId]) {
            this.bindings = { ...PRESETS[presetId].bindings };
            this.activePreset = presetId;
            this._save();
            this._refreshUI();
            this._notify();
        }
    }

    /** Subscribe to binding changes */
    onChange(fn) {
        this._listeners.push(fn);
    }

    /** Open the settings modal */
    open() {
        document.getElementById('settings-overlay').classList.add('visible');
    }

    /** Close the settings modal */
    close() {
        document.getElementById('settings-overlay').classList.remove('visible');
        // Cancel any pending rebind
        this._cancelRebind();
    }

    toggle() {
        const overlay = document.getElementById('settings-overlay');
        if (overlay.classList.contains('visible')) {
            this.close();
        } else {
            this.open();
        }
    }

    // ── Private ──

    _save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            bindings: this.bindings,
            activePreset: this.activePreset
        }));
    }

    _load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (data.bindings) {
                    this.bindings = { ...PRESETS.wasd.bindings, ...data.bindings };
                    this.activePreset = data.activePreset || 'custom';
                }
            }
        } catch { /* use defaults */ }
    }

    _notify() {
        this._listeners.forEach(fn => fn(this.bindings));
    }

    _cancelRebind() {
        if (this._rebindHandler) {
            window.removeEventListener('keydown', this._rebindHandler, true);
            this._rebindHandler = null;
        }
        const active = document.querySelector('.key-btn.listening');
        if (active) active.classList.remove('listening');
    }

    _buildUI() {
        // Overlay container
        const overlay = document.createElement('div');
        overlay.id = 'settings-overlay';
        overlay.innerHTML = `
            <div class="settings-panel">
                <div class="settings-header">
                    <h2>Controls Settings</h2>
                    <button id="settings-close-btn" class="settings-close">&times;</button>
                </div>
                <div class="settings-presets">
                    <span class="preset-label">Presets:</span>
                    <button class="preset-btn" data-preset="wasd">WASD</button>
                    <button class="preset-btn" data-preset="arrows">Arrow Keys</button>
                </div>
                <div class="settings-bindings" id="settings-bindings"></div>
                <div class="settings-footer">
                    <p class="settings-hint">Click a key button, then press a new key to rebind.</p>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Close button
        document.getElementById('settings-close-btn').addEventListener('click', () => this.close());

        // Click outside to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.close();
        });

        // Preset buttons
        overlay.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPreset(btn.dataset.preset);
            });
        });

        // Build binding rows
        this._refreshUI();

        // Settings gear button (injected into HUD)
        const gearBtn = document.createElement('button');
        gearBtn.id = 'settings-gear';
        gearBtn.innerHTML = '⚙';
        gearBtn.title = 'Controls Settings';
        gearBtn.addEventListener('click', () => this.toggle());
        document.getElementById('ui-container').appendChild(gearBtn);
    }

    _refreshUI() {
        const container = document.getElementById('settings-bindings');
        if (!container) return;
        container.innerHTML = '';

        for (const action in ACTION_LABELS) {
            const row = document.createElement('div');
            row.className = 'binding-row';

            const label = document.createElement('span');
            label.className = 'binding-label';
            label.textContent = ACTION_LABELS[action];

            const btn = document.createElement('button');
            btn.className = 'key-btn';
            btn.textContent = this.bindings[action] ? getKeyDisplayName(this.bindings[action]) : '—';
            btn.addEventListener('click', () => this._startRebind(action, btn));

            row.appendChild(label);
            row.appendChild(btn);
            container.appendChild(row);
        }

        // Highlight active preset
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.preset === this.activePreset);
        });
    }

    _startRebind(action, btn) {
        this._cancelRebind();
        btn.classList.add('listening');
        btn.textContent = '...';

        this._rebindHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const key = e.key.toLowerCase();
            if (key === 'escape') {
                // Cancel rebind
                this._cancelRebind();
                this._refreshUI();
                return;
            }
            this.setBinding(action, key);
            window.removeEventListener('keydown', this._rebindHandler, true);
            this._rebindHandler = null;
        };

        window.addEventListener('keydown', this._rebindHandler, true);
    }
}
