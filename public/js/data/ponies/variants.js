'use strict';
/* DATA - pony varieties: one per biome, each with its own coats, manes, cutie marks, names and a signature accessory / effect.
 * `theme` gives the variety a speciality: frost ponies are ice-themed (a unicorn that is Frost learns ice magic); orchard pegasi bless nearby crops.
 * `biome: null, legacy: true` varieties are no longer born anywhere but are kept so ponies saved earlier still look the same. */

  PonyVariantTable.register({ id: 'meadow', name: 'Meadow', biome: 'normal', accessory: null, glow: null });
  PonyVariantTable.register({ id: 'moss', name: 'Moss', biome: 'forest', accessory: 'leaves', glow: null,
    coats: ['#9fcf9a', '#7fb77f', '#c7d8a3', '#b4a77a'], manes: [['#2e7d32', '#81c784'], ['#33691e', '#9ccc65', '#c0ca33'], ['#4e342e', '#8d6e63']],
    marks: ['leaf', 'apple', 'flower'], names: ['Fern', 'Ivy', 'Hazel', 'Bracken', 'Juniper', 'Mossy', 'Alder', 'Clover'] });
  PonyVariantTable.register({ id: 'marsh', name: 'Marsh', biome: null, legacy: true, accessory: 'bubbles', glow: null,
    coats: ['#9fd8d0', '#7ec8c8', '#b6e3dd', '#8fb8d9'], manes: [['#00838f', '#4dd0e1'], ['#26a69a', '#80cbc4', '#b2dfdb'], ['#3949ab', '#7986cb']],
    marks: ['drop', 'leaf', 'cloud'], names: ['Ripple', 'Reed', 'Brook', 'Lily', 'Dewdrop', 'Tadpole', 'Marlow', 'Teal'] });
  PonyVariantTable.register({ id: 'dune', name: 'Dune', biome: null, legacy: true, accessory: 'dust', glow: null,
    coats: ['#f0d9a0', '#e8c48a', '#d9a56b', '#f4e2b8'], manes: [['#c0561f', '#f2a65a'], ['#8d4a1d', '#d9822b', '#f2c14e'], ['#6d4c41', '#bf8f5a']],
    marks: ['sun', 'flame', 'moon'], names: ['Saffron', 'Sienna', 'Mirage', 'Cumin', 'Amber', 'Sirocco', 'Dune', 'Paprika'] });
  PonyVariantTable.register({ id: 'frost', name: 'Frost', theme: 'ice', biome: 'ice', accessory: 'frost', glow: null,
    coats: ['#eef3fa', '#dbe7f3', '#c6d4e4', '#f5f9ff'], manes: [['#78909c', '#cfd8dc'], ['#5c6bc0', '#b3c5ff', '#e8eaf6'], ['#455a64', '#90a4ae']],
    marks: ['snow', 'cloud', 'star'], names: ['Flurry', 'Glacier', 'Rime', 'Icicle', 'Tundra', 'Sleet', 'Snowdrop', 'Hoar'] });
  PonyVariantTable.register({ id: 'blossom', name: 'Blossom', biome: null, legacy: true, accessory: 'crown', glow: null,
    coats: ['#fbd3e3', '#f7b8d2', '#fde2ee', '#e8c3f2'], manes: [['#d81b60', '#f48fb1', '#ffd1e8'], ['#8e24aa', '#ce93d8'], ['#ff80ab', '#ffcdd2', '#fff3e0']],
    marks: ['flower', 'heart', 'apple'], names: ['Sakura', 'Peony', 'Wisteria', 'Lotus', 'Camellia', 'Orchid', 'Poppy', 'Magnolia'] });
  PonyVariantTable.register({ id: 'crystal', name: 'Crystal', biome: 'crystal', accessory: 'crystals', glow: '#9fe7ff',
    coats: ['#d6f1ff', '#bfe6fa', '#e4f5ff', '#cdd6ff'], manes: [['#00b8d4', '#84ffff', '#e0f7fa'], ['#7c4dff', '#b388ff', '#e1d5ff'], ['#00e5ff', '#ffffff']],
    marks: ['gem', 'star', 'drop'], names: ['Prism', 'Glint', 'Opal', 'Quartz', 'Beryl', 'Shard', 'Topaz', 'Facet'] });
  PonyVariantTable.register({ id: 'starlit', name: 'Starlit', biome: 'magic', accessory: 'stars', glow: '#b9a6ff',
    coats: ['#2a2f6b', '#1f2557', '#3b2f78', '#233a6e'], manes: [['#7e57c2', '#4dd0e1', '#f48fb1'], ['#ffe082', '#ffffff'], ['#26c6da', '#9575cd', '#ede7f6']],
    marks: ['star', 'moon', 'gem'], names: ['Nova', 'Lyra', 'Vesper', 'Orion', 'Selene', 'Comet', 'Astra', 'Eclipse'] });
  PonyVariantTable.register({ id: 'ember', name: 'Ember', biome: 'fire', accessory: 'flames', glow: '#ff9a3c',
    coats: ['#4a3b3b', '#5d4037', '#6d4c41', '#3e2f2f'], manes: [['#ff3d00', '#ff9100', '#ffd740'], ['#d50000', '#ff6e40', '#ffab40'], ['#ff6f00', '#ffca28']],
    marks: ['flame', 'sun', 'star'], names: ['Cinder', 'Blaze', 'Kindle', 'Ash', 'Spark', 'Magma', 'Flare', 'Pyre'] });

PonyVariantTable.register({ id: 'jungle', name: 'Jungle', biome: 'jungle', accessory: 'leaves', glow: null,
  coats: ['#8fd19a', '#6fc08a', '#b5e0a0', '#7fb89a'], manes: [['#00796b', '#4db6ac'], ['#1b5e20', '#66bb6a', '#c6ff00'], ['#e65100', '#ffb74d']],
  marks: ['leaf', 'flower', 'drop'], names: ['Liana', 'Canopy', 'Tamarind', 'Mango', 'Orchid', 'Parrot', 'Vine', 'Fern'] });
PonyVariantTable.register({ id: 'orchard', name: 'Orchard', biome: 'apple', accessory: 'leaves', glow: null, theme: 'orchard',
  coats: ['#f7c6c6', '#f4d9a8', '#e8f0b8', '#fbe0d0'], manes: [['#c62828', '#ef9a9a'], ['#2e7d32', '#a5d6a7', '#ffe082'], ['#ef6c00', '#ffcc80']],
  marks: ['apple', 'heart', 'flower'], names: ['Cider', 'Russet', 'Pippin', 'Gala', 'Cobbler', 'Fuji', 'Jonagold', 'Crisp'] });
PonyVariantTable.register({ id: 'candy', name: 'Candy', biome: 'candy', accessory: 'sprinkles', glow: null,
  coats: ['#ffd1e8', '#d1f5e0', '#e6d1ff', '#fff0b3'], manes: [['#ff4081', '#ffb3d1', '#ffffff'], ['#00bfa5', '#a7ffeb'], ['#7c4dff', '#ffd1e8', '#b2ebf2']],
  marks: ['heart', 'star', 'note'], names: ['Taffy', 'Gumdrop', 'Fudge', 'Sherbet', 'Bonbon', 'Toffee', 'Truffle', 'Jellybean'] });
PonyVariantTable.register({ id: 'rainbow', name: 'Rainbow', biome: 'rainbow', accessory: 'rainbow', glow: '#ffffff',
  coats: ['#ffffff', '#f4eef7', '#e8f5ff', '#fff4e6'], manes: [['#ff1744', '#ff9100', '#ffea00', '#00e676'], ['#2979ff', '#651fff', '#d500f9', '#ff4081'], ['#00e5ff', '#69f0ae', '#ffff00']],
  marks: ['star', 'cloud', 'drop'], names: ['Prismatic', 'Iris', 'Spectrum', 'Arco', 'Skylark', 'Halo', 'Aurora', 'Dazzle'] });
