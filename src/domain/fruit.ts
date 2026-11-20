import { ESP } from './catalog'

const SHAPE: Record<string, string> = { durazno: 'round', nectarina: 'round', damasco: 'round', ciruela: 'round', manzana: 'apple', pera: 'pear', cereza: 'cherry', vid: 'cluster', olivo: 'oval', nogal: 'nut', almendro: 'nut', higo: 'pear', granada: 'round', membrillo: 'pear', kiwi: 'oval', arandano: 'cluster', frutilla: 'pear', frambuesa: 'cluster', naranja: 'round', mandarina: 'round', limon: 'oval', pomelo: 'round', palta: 'pear', otro: 'leaf' };
export function fruitSvg(esp: string, px = 20): string {
    const c = (ESP[esp] ?? ESP.otro).c, sh = SHAPE[esp] ?? 'leaf', st = ' stroke="rgba(15,23,42,.35)" stroke-width="1"';
  const leaf = '<path d="M12 6c1-3 4-4 6-3-.5 3-3 4.5-6 3z" fill="#4CAC50"' + st + '/>';
  let b: string;
    if (sh === 'round') b = '<circle cx="12" cy="14" r="8" fill="' + c + '"' + st + '/><path d="M12 7c-1 2-1 4 0 6" fill="none" stroke="rgba(15,23,42,.25)"/><ellipse cx="9" cy="11.5" rx="2" ry="3" fill="#fff" opacity=".3"/><path d="M12 7V5" stroke="#6B4F2A" stroke-width="1.5"/>' + leaf;
    else if (sh === 'apple') b = '<path d="M12 8c-3-2-8 0-8 6 0 4 3 8 5 8 1.2 0 2-.6 3-.6s1.8.6 3 .6c2 0 5-4 5-8 0-6-5-8-8-6z" fill="' + c + '"' + st + '/><ellipse cx="8.5" cy="13" rx="1.6" ry="2.6" fill="#fff" opacity=".3"/><path d="M12 8V4.5" stroke="#6B4F2A" stroke-width="1.5"/>' + leaf;
    else if (sh === 'pear') b = '<path d="M12 5c2.2 0 3.2 1.6 3.2 3.2 0 1.6 2.8 2.6 2.8 6.3a6 6 0 0 1-12 0c0-3.7 2.8-4.7 2.8-6.300C8.8 6.6 9.8 5 12 5z" fill="' + c + '"' + st + '/><ellipse cx="9.5" cy="14" rx="1.5" ry="2.8" fill="#fff" opacity=".3"/><path d="M12 5V3" stroke="#6B4F2A" stroke-width="1.5"/>' + leaf;
    else if (sh === 'cherry') b = '<circle cx="8" cy="17" r="4.5" fill="' + c + '"' + st + '/><circle cx="16.5" cy="16" r="4.5" fill="' + c + '"' + st + '/><path d="M8 12.500C9 8 11 5 13 3.500M16.5 11.500C15.5 8 14 5 13 3.5" fill="none" stroke="#4A7A30" stroke-width="1.4"/><path d="M13 3.500c2-1 4 0 5 1.5-2 .8-4 .5-5-1.500z" fill="#4CAC50"' + st + '/>';
    else if (sh === 'cluster') b = [[8,10],[14,10],[11,14],[17,14],[8,17],[14,18],[11,21]].map((p) => { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.3" fill="' + c + '"' + st + '/>'; }).join('') + '<path d="M11 7V4" stroke="#6B4F2A" stroke-width="1.5"/><path d="M11 5c1-2.5 4-3.5 6-2.5-.5 3-3 4-6 2.500z" fill="#4CAC50"' + st + '/>';
    else if (sh === 'oval') b = '<ellipse cx="12" cy="14" rx="6" ry="8" transform="rotate(25 12 14)" fill="' + c + '"' + st + '/><ellipse cx="10" cy="12" rx="1.3" ry="3" transform="rotate(25 10 12)" fill="#fff" opacity=".3"/><path d="M14 6.500c1-1.5 3-2 4.5-1.5-.5 2-2.5 3-4.5 1.500z" fill="#4CAC50"' + st + '/>';
    else if (sh === 'nut') b = '<ellipse cx="12" cy="13.5" rx="6.5" ry="8" fill="' + c + '"' + st + '/><path d="M12 5.500v16M9 8c-1.5 3.5-1.5 8 0 11M15 8c1.5 3.5 1.5 8 0 11" fill="none" stroke="rgba(15,23,42,.3)"/>';
    else b = '<path d="M5 19C5 10 10 5 20 4c0 9-5 15-15 15z" fill="#4CAC50"' + st + '/><path d="M5 19L14 10" stroke="rgba(255,255,255,.6)" stroke-width="1.4"/>';
    return '<svg class="fr" width="' + (px || 20) + '" height="' + (px || 20) + '" viewBox="0 0 24 24" aria-hidden="true">' + b + '</svg>';
  }
