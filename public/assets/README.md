# Your pictures

Put the pictures you draw here, then point to them from the content editor (`editor.html`). Paths are relative to `index.html`,
so a file at `public/assets/creatures/pony_up.png` is entered as `assets/creatures/pony_up.png`. PNG with transparency works best.

Nothing needs a picture: anything you leave empty is drawn by the game's own procedural artwork, so you can replace things one at a time.

```
assets/
  items/        icons, "on the ground", "in the hand", "built" and "worn" pictures
  creatures/    ponies and animals, four directions each
  characters/   the prince and princess bodies, four directions each
```

## Directions

Creatures and characters have four slots: **up** (walking away from the camera), **down** (walking towards it), **left** and **right**.
An empty direction borrows another: up uses right (then left), down uses left (then right), and left / right mirror each other.
So one side view is enough to start with; add the others when you have them.

The game itself has no up / down artwork yet either: `AnimalSprite._drawUp` / `_drawDown` and `PlayerSprite._drawUp` / `_drawDown`
(in `js/client/render/`) are the boilerplate hooks, and for now they draw the side view.

## Sizes and anchors

| Picture | Anchor | Size it is drawn at |
| --- | --- | --- |
| Creature / character | feet at the **bottom centre** | its own pixel size x `scale` (the procedural pony is about 60 x 50 px, a character about 30 x 66 px) |
| Creature portrait | a close-up painting of the animal (`sprites.portrait`) | fills its frame in the Pony Book and the Journal, cropped to fit and keeping the top (the face) |
| Walk cycle | `frames` equal frames side by side in one strip, played at `fps` while moving (frame 0 when standing) | one frame |
| Item icon | centred | 48 x 48 in the inventory (any square picture) |
| On the ground | bottom centre on the spot | 26 px wide |
| In the hand | the grip at the **bottom centre**, pointing **up** | about as long as the tool (17-30 px), turned to where you face and swung |
| Built (stations) | bottom at the tile's front corner | one tile wide (96 px) |
| Worn (wardrobe: crown, outfit, cape) | a full-body overlay, same size and anchor as the character picture, one per direction; drawn cape, then outfit, then crown | same as the character |

`Feet offset` (anchorY) moves a picture down by that many pixels if your feet are not on the last row.
