import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Clutter from 'gi://Clutter';

export default class DockerTopBarExtension extends Extension {
    enable() {
        this._indicator = new PanelMenu.Button(0.0, 'DockerTopBar', false);

        this._label = new St.Label({
             text: '🐳 carregando...',
             y_align: Clutter.ActorAlign.CENTER
        });
        
        this._indicator.add_child(this._label);

        Main.panel.addToStatusArea(this.uuid, this._indicator);

        this._updateDockerStatus();
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            this._updateDockerStatus();
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._timeoutId){
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    async _execDockerCommand(args) {
        try {
            let proc = new Gio.Subprocess({
                argv: ['docker', ...args],
                flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            });
            proc.init(null);

            return new Promise((resolve, reject) => {
                proc.communicate_utf8_async(null, null, (proc, res) => {
                    try {
                        let [, stdout, stderr] = proc.communicate_utf8_finish(res);
                        if (proc.get_successful()) {
                            resolve(stdout.trim());
                        } else {
                            reject(stderr.trim());
                        }
                    } catch (e) {
                        reject(e.message);
                    }
                });
            });
        } catch (e) {
            throw new Error(`Falha ao executar docker: ${e.message}`);
        }
    }

    async _updateDockerStatus() {
        try {
            // Formato JSON customizado para facilitar o parse em JS
            let format = '{"id":"{{.ID}}","name":"{{.Names}}","status":"{{.Status}}","ports":"{{.Ports}}"}';
            let stdout = await this._execDockerCommand(['ps', '--format', format]);

            let containers = stdout ? stdout.split('\n').map(line => JSON.parse(line)) : [];
            let count = containers.length;

            // Atualiza o texto dinâmico da top-bar
            if (count === 0) {
                this._label.set_text('🐳 a baleia não tem filhotes');
            } else if (count === 1) {
                this._label.set_text('🐳 a baleia tem 1 filhote');
            } else {
                this._label.set_text(`🐳 a baleia tem ${count} filhotes`);
            }

            // Atualiza os itens do menu ao clicar
            this._buildPopupMenu(containers);
        } catch (error) {
            this._label.set_text('🐳 Docker indisponível');
            this._menuHeader('Erro ao acessar o Docker socket');
        }
    }

    _buildPopupMenu(containers) {
        this._indicator.menu.removeAll();

        let titleItem = new PopupMenu.PopupMenuItem('Containers em Execução', { reactive: false });
        this._indicator.menu.addMenuItem(titleItem);
        this._indicator.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

        if (containers.length === 0) {
            let emptyItem = new PopupMenu.PopupMenuItem('Nenhum container ativo no momento', { reactive: false });
            this._indicator.menu.addMenuItem(emptyItem);
            return;
        }

        containers.forEach(c => {
            let containerText = `🚢 ${c.name} (${c.id})\n   Status: ${c.status}${c.ports ? '\n   Portas: ' + c.ports : ''}`;
            let item = new PopupMenu.PopupMenuItem(containerText);
            
            item.connect('activate', () => {
                log(`Container selecionado: ${c.name}`);
            });

            this._indicator.menu.addMenuItem(item);
        });
    }

    _menuHeader(text) {
        this._indicator.menu.removeAll();
        this._indicator.menu.addMenuItem(new PopupMenu.PopupMenuItem(text, { reactive: false }));
    }
}
