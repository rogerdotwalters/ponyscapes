# Dungeon rooms

`rooms/<id>.png` are the dungeon rooms: **one pixel = one tile**, so a 100x150 PNG is a 100x150 tile room. After adding or changing one, run

    npm run rooms

which turns every PNG here into `public/js/content/caveRooms.js` (the game reads that file) and reports problems. The file name is the room's id; a dungeon
(`public/js/data/dungeons/`) lists its rooms by id, in order.

8-bit greyscale (open it in any paint program: it is a viewable palette):

| grey | tile | code |
|---|---|---|
| 128 (mid grey) | floor | 0 |
| 64 (darker grey) / 0 (black) | wall / rock | 1 |
| 255 (white) | entrance (where you arrive; go back through it) | 2 |
| 224 | exit / next room | 3 |
| 192 | enemy spawn node (a random enemy) | 4 |
| 160 | chest | 5 |
| 1-31 | a specific enemy, 1000-1030 (`js/shared/enemyCodes.js`) | 1000+ |

16-bit greyscale: the pixel value *is* the code (0 floor, 1 wall ... 1000+ enemies). Exact, but nearly black on screen.

A room needs an entrance (2) and an exit (3) with a walkable way between them. `rooms/cavern_*.png` are temporary rooms from `npm run rooms:samples`.
