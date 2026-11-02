// Assemble une page HTML autonome (jeu compilé en ligne, Phaser via cdnjs).
import { readFileSync, writeFileSync } from 'node:fs';

const js = readFileSync('dist-artifact/plugd.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const html = `<title>Plug'd</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#14315C">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Barlow+Condensed:wght@600;700&display=swap">
<style>
  :root { --blueprint: #14315C; --line: #E8F1FA; color-scheme: dark; }
  html, body { height: 100%; margin: 0; background: var(--blueprint); color: var(--line); overflow: hidden; }
  body { touch-action: none; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; overscroll-behavior: none; }
  #game {
    position: fixed;
    top: env(safe-area-inset-top, 0px);
    bottom: env(safe-area-inset-bottom, 0px);
    left: env(safe-area-inset-left, 0px);
    right: env(safe-area-inset-right, 0px);
  }
  #game canvas { display: block; }
  #boot { position: fixed; inset: 0; display: grid; place-items: center; font: 14px "JetBrains Mono", ui-monospace, monospace; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); text-align: center; }
</style>
<div id="game"></div>
<div id="boot">Chargement de Plug'd…</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/phaser/3.90.0/phaser.min.js"></script>
<script>
(function () {
  var boot = document.getElementById('boot');
  if (typeof Phaser === 'undefined') { boot.textContent = "Impossible de charger Phaser. Vérifie la connexion puis recharge la page."; return; }
  function start() {
    boot.remove();
${js}
  }
  // Attend les polices pour que le HUD s'affiche avec la bonne typo.
  var fonts = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('700 20px "Barlow Condensed"'), document.fonts.load('14px "JetBrains Mono"')])
    : Promise.resolve();
  Promise.race([fonts, new Promise(function (r) { setTimeout(r, 1500); })]).then(start, start);
})();
</script>
`;
writeFileSync('dist-artifact/plugd.html', html);
console.log('dist-artifact/plugd.html', (html.length / 1024).toFixed(1), 'Ko');
