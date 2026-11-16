export type Group = 'main' | 'pikachu' | 'secret' | 'rgb' | 'classic' | 'energy';
export interface Card { id: string; num: string; name: string; rarity: string; group: Group; set?: string; img?: string; }

const pad = (n: number) => String(n).padStart(3, '0');
const A = 'Exeggcute,Alolan Exeggutor,Volbeat,Illumise,Tropius,Cherubi,Cherrim,Vivillon,Vulpix,Ninetales,Moltres,Ho-Oh,Victini,Reshiram,Fuecoco ex,Slowpoke,Lapras,Articuno,Kyogre,Palkia,Greninja ex,Wishiwashi'.split(',');
const B = 'Pikachu ex · Day,Pikachu ex · Night,Zapdos,Zekrom,Zeraora,Toxel,Toxtricity,Toxtricity,Morpeko,Miraidon,Mewtwo,Mewtwo ex,Mew,Mew ex,Marill,Azumarill,Espeon,Espeon ex,Sylveon ex,Unown,Drifloon,Cresselia,Chandelure,Xerneas,Comfey,Cosmog,Cosmoem,Lunala,Gimmighoul,Groudon,Lucario,Seismitoad,Lycanroc,Koraidon,Nidoran ♀,Nidorina,Alolan Meowth,Gengar ex,Umbreon,Umbreon ex,Murkrow,Scraggy,Zorua,Zoroark,Deino,Zweilous,Hydreigon,Yveltal,Galarian Meowth,Jirachi ex,Dialga,Ferrothorn,Solgaleo,Zacian,Zamazenta,Gholdengo,Salamence ex,Jangmo-o,Hakamo-o,Kommo-o,Meowth,Kangaskhan,Ditto,Eevee,Eevee,Eevee,Snorlax,Igglybuff,Lugia,Hisuian Zorua,Hisuian Zoroark,Minior,Maushold,Poké Pad,Switch,Ultra Ball'.split(',');
const RARE = new Set([12, 14, 19, 20, 56, 62, 63, 65, 76, 80, 82, 86, 100, 103, 105, 106, 107, 121]);
const DOUBLE = new Set([15, 21, 53, 54, 64, 66, 70, 71, 90, 92, 102, 109]);

const CDN = 'https://bills-archive.nyc3.cdn.digitaloceanspaces.com/';
const T = CDN + 'assets/30th-thumbs/', X = CDN + 'tcgdex_cards_small/', AR = CDN + 'assets/articles/';
const EN = new Set([11,12,13,15,16,18,23,25,26,30,32,33,34,38,39,40,41,43,44,49,53,54,55,57,67,70,92,102,114,116,117,118,121,134,141,148,149,150,156]);
const SP: Record<number, string> = {28:'30th_EN_28',42:'30th_EN_42',50:'30th_EN_50',88:'30th_EN_88',36:'30th-14_pikachu',37:'30th-15_pikachu',47:'30th-25_pikachu',89:'30th_EN_089-Alolan-Meowth',113:'30th_EN_113-Meowth',139:'30th_EN_139-Alolan-Meowth',144:'30th_EN_144-Meowth'};
const TX: Record<number, string> = {21:'30th-21_greninja-ex',69:'30th-69_espeon',71:'30th-71_sylveon-ex',91:'30th-91_umbreon',131:'30th-131_lapras',136:'30th-136_drifloon',138:'30th-138_lycanroc',145:'30th-145_zorua'};
const ART: Record<number, string> = {151:'en-151',152:'en-152',154:'en-154'};
const img = (k: number) => TX[k] ? X + 'cel30/' + TX[k] + '.webp' : ART[k] ? AR + '30th-most-expensive/' + ART[k] + '.webp' : T + (SP[k] ?? (EN.has(k) ? '30th_EN_' + pad(k) : 'e' + pad(k))) + '.webp';

const main: Card[] = [...A, ...Array(30).fill('Pikachu'), ...B].map((n, i) => {
  const k = i + 1;
  const pika = k >= 23 && k <= 52;
  return {
    id: 'm' + k, img: img(k), num: `${pad(k)}/128`, group: pika ? 'pikachu' : 'main',
    name: pika ? `Pikachu ${k - 22}/30` : n,
    rarity: pika ? 'Pikachu Rare' : DOUBLE.has(k) ? 'Double Rare' : RARE.has(k) ? 'Rare' : 'Common',
  } as Card;
});

const IR = 'Alolan Exeggutor,Moltres,Lapras,Articuno,Zapdos,Toxtricity,Morpeko,Drifloon,Chandelure,Lycanroc,Alolan Meowth,Scraggy,Galarian Meowth,Gholdengo,Kommo-o,Meowth,Hisuian Zorua,Maushold'.split(',');
const SIR = 'Fuecoco ex,Greninja ex,Pikachu ex · Day,Pikachu ex · Night,Mewtwo ex,Mew ex,Sylveon ex,Gengar ex,Jirachi ex,Salamence ex'.split(',');
const secret: Card[] = [
  ...IR.map((n, i) => ({ n, k: 129 + i, r: 'Illustration Rare' })),
  ...SIR.map((n, i) => ({ n, k: 147 + i, r: 'Special Illustration Rare' })),
  { n: 'Mewtwo ex', k: 157, r: 'Futuristic Rare' }, { n: 'Mew ex', k: 158, r: 'Futuristic Rare' },
].map(x => ({ id: 's' + x.k, img: img(x.k), num: `${x.k}/128`, name: x.n, rarity: x.r, group: 'secret' as Group }));

const rgb: Card[] = [['R', 'Rojo'], ['G', 'Verde'], ['B', 'Azul']].map(([l, c]) =>
  ({ id: 'rgb' + l, img: AR + 'rgb-mew-' + ({R:'red',G:'green',B:'blue'} as any)[l] + '.webp', num: `${l}/RGB`, name: `Mew (${c})`, rarity: 'RGB Rare', group: 'rgb' as Group }));

const CP = 'base1/base1-58_pikachu;T30tha_charizard;gym1/gym1-18_misty;gym2/gym2-69_erikas-jigglypuff;neo1/neo1-25_sneasel;neo4/neo4-106_shining-celebi;T30th_EN_149_old;ex1/ex1-5_delcatty;ex7/ex7-19_dark-tyranitar;ex10/ex10-108_scizor-ex;ex11/ex11-11_metagross-%CE%B4;dp4/dp4-106_palkia;dp6/dp6-43_uxie;pl1/pl1-47_crobat-g;hgss4/hgss4-94_gengar;hgss4/hgss4-99_darkrai-cresselia-legend;hgss4/hgss4-100_darkrai-cresselia-legend;bw3/bw3-101_n;bw6/bw6-85_rayquaza-ex;bw10/bw10-11_genesect-ex;xy5/xy5-106_m-gardevoir-ex;xy9/xy9-41_greninja-break;sm1/sm1-89_solgaleo-gx;sm4/sm4-57_buzzwole-gx;T30tha_pikachu-zekrom-gx;swsh1/swsh1-138_zacian-v;swsh4/swsh4-50_raikou;swsh8/swsh8-114_mew-vmax;swsh9/swsh9-123_arceus-vstar;sv02/sv02-203_magikarp'.split(';');
const classic: Card[] = ('Pikachu|58/102|Base Set;Charizard|4/102|Base Set;Misty|18/132|Gym Heroes;Erika’s Jigglypuff|69/132|Gym Challenge;Sneasel|25/111|Neo Genesis;Shining Celebi|106/105|Neo Destiny;“Crystal” Lugia|149/147|Aquapolis;Delcatty|5/109|EX Ruby & Sapphire;Dark Tyranitar|19/109|EX Team Rocket Returns;Scizor ex|108/115|EX Unseen Forces;Metagross δ|11/113|EX Delta Species;Palkia LV.X|106/106|Great Encounters;Uxie|43/146|Legends Awakened;Crobat G|47/127|Platinum;Gengar Prime|94/102|HS Triumphant;Darkrai & Cresselia LEGEND (top)|99/102|HS Triumphant;Darkrai & Cresselia LEGEND (bottom)|100/102|HS Triumphant;N|101/101|Noble Victories;Rayquaza-EX|85/124|Dragons Exalted;Genesect-EX|11/101|Plasma Blast;M Gardevoir-EX|106/160|Primal Clash;Greninja BREAK|41/122|BREAKpoint;Solgaleo-GX|89/149|Sun & Moon;Buzzwole-GX|57/111|Crimson Invasion;Pikachu & Zekrom-GX|33/181|Team Up;Zacian V|138/202|Sword & Shield;Raikou|050/185|Vivid Voltage;Mew VMAX|114/264|Fusion Strike;Arceus VSTAR|123/172|Brilliant Stars;Magikarp|203/193|Paldea Evolved')
  .split(';').map((s, i) => {
    const [name, num, set] = s.split('|');
    return { id: 'c' + i, img: CP[i].startsWith('T') ? T + CP[i].slice(1) + '.webp' : X + CP[i] + '.webp', num, name, set, rarity: 'Classic Collection', group: 'classic' as Group };
  });

const energy: Card[] = 'Grass,Fire,Water,Lightning,Psychic,Fighting,Darkness,Metal'.split(',').map((t, i) =>
  ({ id: 'e' + i, img: T + '30th_energy_' + pad(9 + i) + '.webp', num: `MEE ${pad(9 + i).slice(1)}`, name: `Basic ${t} Energy`, rarity: 'Basic Energy', group: 'energy' as Group }));

export const CARDS: Card[] = [...main, ...secret, ...rgb, ...classic, ...energy];
