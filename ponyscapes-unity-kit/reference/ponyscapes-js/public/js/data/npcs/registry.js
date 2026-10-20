'use strict';
/* DATA - NPCs: the villagers. EVERY villager is one entry here, each in its own file (baker.js, blacksmith.js...). They extend the same Being class as the
 * animals, so you befriend them with the same heart meter (and it trains the Friendship skill).
 *   look     [body, hairStyle, hairColour, skin, outfit, trim]  - the same numbers as the character screen (body 0 = prince, 1 = princess)
 *   gear     what they wear: { crown, outfit, cape } wardrobe item ids (dresses for princess-bodied, garb for prince-bodied)
 *   home     where they live and wander about (tiles), radius = how far they roam
 *   tastes   { loves, likes, dislikes }: items they have an opinion about when you give them a gift
 *   quests   optional: [{ id, title, text }]: plain story text shown as choices in the dialogue window. The world's real quests (steps, rewards) are in js/data/quests/ and name their villager as `giver`
 *   works    optional: the building they keep a shop in (its `shop` list is what the dialogue's Shop choice opens)
 *   talk     what they say, by friendship level: the last band whose `min` you have reached is used */
const Npcs = new Registry('npcs', { required: ['name', 'role', 'look', 'home', 'talk'] });
