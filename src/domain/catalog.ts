// Biblioteca de cultivos y variedades (precargada; el productor puede agregar las suyas).
export const ESP: Record<string, { n: string; c: string }> = { durazno: { n: 'Durazno', c: '#F2A65A' }, nectarina: { n: 'Nectarina', c: '#E8884A' }, damasco: { n: 'Damasco', c: '#F4B860' }, ciruela: { n: 'Ciruela', c: '#A26BC0' }, manzana: { n: 'Manzana', c: '#E8776A' }, pera: { n: 'Pera', c: '#C4D45E' },
    cereza: { n: 'Cereza', c: '#DB5A8A' }, vid: { n: 'Vid', c: '#8A4F84' }, olivo: { n: 'Olivo', c: '#93A55E' }, nogal: { n: 'Nogal', c: '#B8946A' }, almendro: { n: 'Almendro', c: '#D9B99B' }, higo: { n: 'Higo', c: '#7B5B8C' },
    granada: { n: 'Granada', c: '#C0392B' }, membrillo: { n: 'Membrillo', c: '#D8C94A' }, kiwi: { n: 'Kiwi', c: '#7FB03A' }, arandano: { n: 'Arándano', c: '#4A5FA8' }, frutilla: { n: 'Frutilla', c: '#E0485A' }, frambuesa: { n: 'Frambuesa', c: '#C2385F' },
    naranja: { n: 'Naranja', c: '#F28C28' }, mandarina: { n: 'Mandarina', c: '#F5A33A' }, limon: { n: 'Limón', c: '#E6D835' }, pomelo: { n: 'Pomelo', c: '#EE8F8A' }, palta: { n: 'Palta', c: '#5F8F3E' }, otro: { n: 'Otro cultivo', c: '#8A97A6' } };
export const VARS: Record<string, string[]> = {
    durazno: ['Elegant Lady', 'Rich Lady', 'Summer Lady', 'Zee Lady', 'Flavorcrest', 'Springcrest', 'Dixiland', 'Pavía tardío', 'Pavía Catherina', 'Royal Glory', 'O’Henry', 'Andross', 'Forastero', 'September Sun'],
    nectarina: ['Fantasia', 'Big Top', 'Sun Grand', 'Venus', 'Summer Fire', 'Arctic Snow', 'August Red', 'Fire Pearl'],
    damasco: ['Canino', 'Bebecou', 'Tilton', 'Patterson', 'Royal Blenheim', 'Moniqui', 'Palstein', 'Rojo Pasión'],
    ciruela: ['D’Agen', 'Angeleno', 'Friar', 'Black Amber', 'Santa Rosa', 'Larry Ann', 'Fortune', 'President', 'Golden Japan', 'Red Beaut', 'Black Diamond', 'Stanley'],
    manzana: ['Red Delicious', 'Gala', 'Royal Gala', 'Fuji', 'Granny Smith', 'Cripps Pink (Pink Lady)', 'Cripps Red', 'Golden Delicious', 'Braeburn', 'Mondial Gala'],
    pera: ['Williams', 'Packham’s Triumph', 'Beurré D’Anjou', 'Abate Fetel', 'Red Bartlett', 'Beurré Bosc', 'Forelle', 'Coscia', 'Rocha', 'Conference'],
    cereza: ['Bing', 'Lapins', 'Sweetheart', 'Brooks', 'Santina', 'Royal Dawn', 'Rainier', 'Skeena', 'Regina', 'Kordia', 'Van', 'Stella'],
    vid: ['Malbec', 'Cabernet Sauvignon', 'Bonarda', 'Torrontés', 'Chardonnay', 'Syrah', 'Merlot', 'Pinot Noir', 'Criolla Grande', 'Cereza', 'Superior Seedless', 'Flame Seedless', 'Crimson Seedless', 'Thompson Seedless', 'Red Globe'],
    olivo: ['Arauco', 'Arbequina', 'Frantoio', 'Manzanilla', 'Picual', 'Coratina', 'Farga', 'Nevadillo Blanco', 'Changlot Real', 'Empeltre'],
    nogal: ['Chandler', 'Franquette', 'Serr', 'Howard', 'Hartley', 'Tulare', 'Pedro', 'Vina', 'Lara', 'Fernor'],
    almendro: ['Nonpareil', 'Carmel', 'Monterey', 'Guara', 'Tuono', 'Marcona', 'Ferragnès', 'Texas'],
    higo: ['Black Mission', 'Kadota', 'Brown Turkey', 'Adriático', 'Brebas'],
    granada: ['Wonderful', 'Acco', 'Mollar de Elche', 'Wonderful One'],
    membrillo: ['Champion', 'Smyrna', 'Pineapple', 'Portugal'],
    kiwi: ['Hayward', 'Bruno', 'Jintao (amarillo)'],
    arandano: ['Duke', 'Brigitta', 'Emerald', 'Legacy', 'Biloxi', 'O’Neal', 'Misty', 'Star'],
    frutilla: ['Albion', 'Monterey', 'San Andreas', 'Camarosa', 'Festival', 'Camino Real'],
    frambuesa: ['Heritage', 'Tulameen', 'Meeker', 'Autumn Bliss'],
    naranja: ['Valencia', 'Navel', 'Washington Navel', 'Salustiana', 'Cara Cara', 'Sanguina'],
    mandarina: ['Satsuma', 'Clementina', 'Nova', 'Murcott', 'Ellendale', 'Ortanique', 'Nadorcott'],
    limon: ['Eureka', 'Lisbon', 'Génova', 'Fino', 'Verna', 'Meyer'],
    pomelo: ['Star Ruby', 'Marsh', 'Ruby Red', 'Duncan'], palta: ['Hass', 'Fuerte', 'Bacon', 'Zutano', 'Reed'], otro: []
  };
