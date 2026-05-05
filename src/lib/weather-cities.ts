export interface CityCenter {
  name: string
  lat: number
  lon: number
}

export const CITY_CENTERS: CityCenter[] = [
  { name: 'București',              lat: 44.4268, lon: 26.1025 },
  { name: 'Cluj-Napoca',            lat: 46.7712, lon: 23.6236 },
  { name: 'Timișoara',              lat: 45.7489, lon: 21.2087 },
  { name: 'Iași',                   lat: 47.1585, lon: 27.6014 },
  { name: 'Constanța',              lat: 44.1598, lon: 28.6348 },
  { name: 'Craiova',                lat: 44.3302, lon: 23.7949 },
  { name: 'Brașov',                 lat: 45.6427, lon: 25.5887 },
  { name: 'Galați',                 lat: 45.4353, lon: 28.0080 },
  { name: 'Ploiești',               lat: 44.9412, lon: 26.0238 },
  { name: 'Oradea',                 lat: 47.0722, lon: 21.9214 },
  { name: 'Alba Iulia',             lat: 46.0703, lon: 23.5804 },
  { name: 'Arad',                   lat: 46.1866, lon: 21.3123 },
  { name: 'Pitești',                lat: 44.8565, lon: 24.8691 },
  { name: 'Bacău',                  lat: 46.5671, lon: 26.9146 },
  { name: 'Bistrița',               lat: 47.1333, lon: 24.5000 },
  { name: 'Botoșani',               lat: 47.7486, lon: 26.6692 },
  { name: 'Brăila',                 lat: 45.2692, lon: 27.9573 },
  { name: 'Buzău',                  lat: 45.1502, lon: 26.8204 },
  { name: 'Călărași',               lat: 44.2010, lon: 27.3310 },
  { name: 'Sfântu Gheorghe',        lat: 45.8670, lon: 25.7871 },
  { name: 'Târgoviște',             lat: 44.9259, lon: 25.4580 },
  { name: 'Giurgiu',                lat: 43.9037, lon: 25.9699 },
  { name: 'Târgu Jiu',              lat: 45.0379, lon: 23.2767 },
  { name: 'Miercurea Ciuc',         lat: 46.3585, lon: 25.8019 },
  { name: 'Deva',                   lat: 45.8836, lon: 22.9122 },
  { name: 'Slobozia',               lat: 44.5641, lon: 27.3689 },
  { name: 'Baia Mare',              lat: 47.6567, lon: 23.5685 },
  { name: 'Drobeta-Turnu Severin',  lat: 44.6229, lon: 22.6566 },
  { name: 'Târgu Mureș',            lat: 46.5455, lon: 24.5621 },
  { name: 'Piatra Neamț',           lat: 46.9222, lon: 26.3717 },
  { name: 'Slatina',                lat: 44.4298, lon: 24.3664 },
  { name: 'Zalău',                  lat: 47.1919, lon: 23.0569 },
  { name: 'Satu Mare',              lat: 47.7921, lon: 22.8857 },
  { name: 'Sibiu',                  lat: 45.7983, lon: 24.1256 },
  { name: 'Suceava',                lat: 47.6515, lon: 26.2560 },
  { name: 'Alexandria',             lat: 43.9769, lon: 25.3349 },
  { name: 'Tulcea',                 lat: 45.1786, lon: 28.7972 },
  { name: 'Râmnicu Vâlcea',         lat: 45.0997, lon: 24.3697 },
  { name: 'Vaslui',                 lat: 46.6413, lon: 27.7282 },
  { name: 'Focșani',                lat: 45.6963, lon: 27.1843 },
  { name: 'Vatra Dornei',           lat: 47.3499, lon: 25.3597 },
  { name: 'Brad',                   lat: 46.1236, lon: 22.4418 },
  { name: 'Beiuș',                  lat: 46.6701, lon: 22.3566 },
  { name: 'Reșița',                 lat: 45.2959, lon: 21.8892 },
  { name: 'Vișeu de Sus',           lat: 47.7200, lon: 24.4200 },
  { name: 'Gheorgheni',             lat: 46.7200, lon: 25.5900 },
  { name: 'Bârlad',                 lat: 46.2290, lon: 27.6680 },
]

export function cityForAntenna(lat: number, lon: number): string {
  let closest = CITY_CENTERS[0]
  let minDist = Infinity
  for (const city of CITY_CENTERS) {
    const d = (city.lat - lat) ** 2 + (city.lon - lon) ** 2
    if (d < minDist) { minDist = d; closest = city }
  }
  return closest.name
}
