# Plug'd

Survivor-like roguelite sans arme : on tue en tirant un câble de borne en borne pour refermer une boucle, et tout ce qui est à l'intérieur grille.

État actuel : **étape 1 de la roadmap, le prototype « une arène »** (bornes fixes, câble, fermeture, décharge selon la surface, refroidissement, Piquet, Rampants et Coupe-fils, formes provisoires).

## Lancer

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests Vitest (géométrie, chaîne, déterminisme)
npm run build      # vérification des types + build de production dans dist/
```

### Paramètres d'URL (prototype)

| Paramètre | Effet |
| --- | --- |
| `?seed=1234` | Rejoue exactement la même arène et les mêmes vagues |
| `?arena=grid` | Gabarit imposé : `grid`, `circle`, `corridors`, `islands` |
| `?speed=0.8` | Vitesse de jeu (accessibilité) |
| `?fx=low` | Réduit flashs et tremblements |
| `?preview=always` | Aperçu de fermeture toujours visible |
| `?sound=off` | Coupe le son |

### Contrôles

| Action | Mobile | Desktop |
| --- | --- | --- |
| Se déplacer | Joystick flottant (glisser n'importe où) | ZQSD / WASD / flèches, manette |
| Accrocher / fermer | Automatique au passage sur une borne | Automatique |
| Piquet | Bouton en bas à droite | Espace (manette : A) |
| Abandonner la chaîne | Double-tap | R (manette : X) |
| Pause | Bouton en haut à droite | Échap |

## Règles implémentées

- Passer sur une borne l'ajoute à la chaîne (rayon de capture 0,6 case).
- Repasser sur une borne de la chaîne ferme le polygone des bornes situées entre les deux passages (3 bornes minimum). La chaîne repart de cette borne.
- Dégâts = 40 × √(4 / surface), bornés entre 10 et 120. Surface calculée selon la règle pair-impair, donc exacte aussi pour un tracé croisé.
- Chaque borne de la boucle surchauffe 4 s (hachures + compte à rebours).
- Câble de 10 cases : au-delà il rompt. Il vibre puis clignote à 80 %.
- Les Coupe-fils foncent sur le câble exposé et le coupent au contact.
- Piquet : borne temporaire de 6 s, recharge 8 s.
- Une arène dure 75 s.

Toutes les valeurs d'équilibrage sont dans [`src/sim/tuning.json`](src/sim/tuning.json), modifiables sans toucher au code.

## Architecture

La simulation est pure (aucune dépendance à Phaser), à pas fixe de 60 Hz et pilotée par un PRNG seedé : même seed + mêmes entrées = même partie. C'est la base du défi quotidien et de la coop en ligne.

```
src/
  sim/         logique pure : world.ts rng.ts geometry.ts chain.ts discharge.ts tuning.json
    systems/   movement, ai, waves, cooldowns, spatialHash
    content/   enemies.ts arenas.ts (gabarits grille, cercle, couloirs, îlots)
  render/      scène Phaser, dessin vectoriel, sons WebAudio
  ui/          HUD, écrans titre / pause / fin
  input/       clavier, joystick tactile, manette
  run/ net/    (étapes suivantes)
server/        (coop en ligne, étape 5)
tests/         géométrie, fermeture de chaîne, intensité, déterminisme
```

Console du navigateur : `plugd.world` donne accès à l'état de la simulation.
