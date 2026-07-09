/**
 * Scout Routes - Учёт ставок и прогнозов
 * Загрузка Excel, парсинг, поиск результатов с динамическим маппингом из БД
 */

const XLSX = require('xlsx');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/rolgi_v6'
});

/**
 * Транслитерация кириллицы в латиницу
 */
const cyrillicToLatin = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
  'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

/**
 * Прямой маппинг русских названий команд в английские
 * Используется когда транслитерация даёт неточный результат
 */

/**
 * Удаление диакритических знаков (ö→o, ü→u, ş→s, ñ→n, é→e и т.д.)
 * Важно для сопоставления транслитерированных русских имён с латинскими
 */
function stripDiacritics(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o').replace(/Ø/g, 'O')
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE');
}

const teamNameMappings = {
  // ==================== АНГЛИЯ ====================
  // Premier League
  'сандерленд': 'sunderland',
  'бернли': 'burnley',
  'ливерпуль': 'liverpool',
  'манчестер юнайтед': 'manchester united',
  'ман юнайтед': 'manchester united',
  'ман сити': 'manchester city',
  'манчестер сити': 'manchester city',
  'челси': 'chelsea',
  'арсенал': 'arsenal',
  'тоттенхэм': 'tottenham',
  'тоттенхем': 'tottenham',
  'ньюкасл': 'newcastle',
  'вест хэм': 'west ham',
  'эвертон': 'everton',
  'астон вилла': 'aston villa',
  'брайтон': 'brighton',
  'кристал пэлас': 'crystal palace',
  'ноттингем форест': 'nottingham forest',
  'брентфорд': 'brentford',
  'фулхэм': 'fulham',
  'вулверхэмптон': 'wolverhampton',
  'вулвз': 'wolverhampton',
  'борнмут': 'bournemouth',
  'лестер': 'leicester',
  'лестер сити': 'leicester',
  'ипсвич': 'ipswich',
  'ипсвич таун': 'ipswich',
  'саутгемптон': 'southampton',
  
  // Championship и другие
  'лидс': 'leeds',
  'лидс юнайтед': 'leeds',
  'шеффилд юнайтед': 'sheffield united',
  'шеффилд уэнсдей': 'sheffield wednesday',
  'миддлсбро': 'middlesbrough',
  'ковентри': 'coventry',
  'ковентри сити': 'coventry',
  'норвич': 'norwich',
  'куинз парк рейнджерс': 'queens park rangers',
  'кпр': 'queens park rangers',
  'портсмут': 'portsmouth',
  'дерби каунти': 'derby county',
  'дерби': 'derby county',
  'престон': 'preston',
  'престон норт энд': 'preston',
  'мэнсфилд': 'mansfield',
  'мэнсфилд таун': 'mansfield',
  'болтон': 'bolton',
  'рочдейл': 'rochdale',
  'форест грин': 'forest green',
  'олтринхэм': 'altrincham',
  'моркам': 'morecambe',
  'борхэм вуд': 'boreham wood',
  'уокинг': 'woking',
  'уотфорд': 'watford',
  'сток': 'stoke',
  'сток сити': 'stoke',
  'вест бром': 'west brom',
  'вест бромвич': 'west brom',
  'блэкберн': 'blackburn',
  'хадерсфилд': 'huddersfield',
  'суонси': 'swansea',
  'суонси сити': 'swansea',
  'кардифф': 'cardiff',
  'кардифф сити': 'cardiff',
  'халл': 'hull',
  'халл сити': 'hull',
  'бристоль': 'bristol',
  'бристоль сити': 'bristol city',
  'милуолл': 'millwall',
  'плимут': 'plymouth',
  'плимут аргайл': 'plymouth',
  'оксфорд': 'oxford',
  'оксфорд юнайтед': 'oxford united',
  'лутон': 'luton',
  'лутон таун': 'luton',
  'бирмингем': 'birmingham',
  'бирмингем сити': 'birmingham',
  'ноттс каунти': 'notts county',
  
  // National League
  'барнет': 'barnet',
  'бромли': 'bromley',
  'йорк': 'york',
  'йорк сити': 'york city',
  'солихалл': 'solihull',
  'солихулл мурс': 'solihull moors',
  'рочестер': 'rochester',
  'гейтсхед': 'gateshead',
  'олдершот': 'aldershot',
  'олдершот таун': 'aldershot',
  'харрогейт': 'harrogate',
  'харрогейт таун': 'harrogate',
  'хартлпул': 'hartlepool',
  'хартлпул юнайтед': 'hartlepool',
  'честер': 'chester',
  'честерфилд': 'chesterfield',
  'колчестер': 'colchester',
  'колчестер юнайтед': 'colchester',
  'суиндон': 'swindon',
  'суиндон таун': 'swindon',
  'нортхэмптон': 'northampton',
  'нортхэмптон таун': 'northampton',
  'питерборо': 'peterborough',
  'питерборо юнайтед': 'peterborough',
  'кроули': 'crawley',
  'кроули таун': 'crawley',
  'эксетер': 'exeter',
  'эксетер сити': 'exeter',
  
  // ==================== ИСПАНИЯ ====================
  'барселона': 'barcelona',
  'барса': 'barcelona',
  'реал мадрид': 'real madrid',
  'реал': 'real madrid',
  'атлетико мадрид': 'atletico madrid',
  'атлетико': 'atletico madrid',
  'севилья': 'sevilla',
  'валенсия': 'valencia',
  'вильярреал': 'villarreal',
  'бетис': 'betis',
  'реал бетис': 'real betis',
  'сосьедад': 'sociedad',
  'реал сосьедад': 'real sociedad',
  'атлетик бильбао': 'athletic bilbao',
  'атлетик': 'athletic club',
  'альбасете': 'albacete',
  'алавес': 'alaves',
  'сельта': 'celta',
  'сельта виго': 'celta vigo',
  'хетафе': 'getafe',
  'жирона': 'girona',
  'мальорка': 'mallorca',
  'осасуна': 'osasuna',
  'райо вальекано': 'rayo vallecano',
  'эспаньол': 'espanyol',
  'леванте': 'levante',
  'лас-пальмас': 'las palmas',
  'овьедо': 'oviedo',
  'реал овьедо': 'oviedo',
  'эльче': 'elche',
  'кадис': 'cadiz',
  'гранада': 'granada',
  'вальядолид': 'valladolid',
  
  // ==================== ГЕРМАНИЯ ====================
  'бавария': 'bayern',
  'бавария мюнхен': 'bayern munchen',
  'боруссия дортмунд': 'borussia dortmund',
  'дортмунд': 'borussia dortmund',
  'боруссия м': 'borussia monchengladbach',
  'боруссия мёнхенгладбах': 'borussia monchengladbach',
  'менхенгладбах': 'borussia monchengladbach',
  'мёнхенгладбах': 'borussia monchengladbach',
  'гладбах': 'borussia monchengladbach',
  'лейпциг': 'leipzig',
  'рб лейпциг': 'rb leipzig',
  'байер': 'bayer',
  'байер леверкузен': 'bayer leverkusen',
  'леверкузен': 'bayer leverkusen',
  'вольфсбург': 'wolfsburg',
  'кельн': '1. fc koln',
  'кёльн': '1. fc koln',
  'айнтрахт': 'eintracht',
  'айнтрахт франкфурт': 'eintracht frankfurt',
  'франкфурт': 'eintracht frankfurt',
  'фрайбург': 'freiburg',
  'хоффенхайм': 'hoffenheim',
  '1899 хоффенхайм': '1899 hoffenheim',
  'вердер': 'werder',
  'вердер бремен': 'werder bremen',
  'бремен': 'werder bremen',
  'унион': 'union berlin',
  'унион берлин': 'union berlin',
  'герта': 'hertha bsc',
  'герта берлин': 'hertha bsc',
  'штутгарт': 'stuttgart',
  'вфб штутгарт': 'vfb stuttgart',
  'аугсбург': 'augsburg',
  'майнц': 'mainz',
  'фсв майнц': 'fsv mainz 05',
  'хайденхайм': '1 fc heidenheim',
  'санкт-паули': 'st. pauli',
  'санкт паули': 'st. pauli',
  'гамбург': 'hamburger sv',
  'гамбургер св': 'hamburger sv',
  'шальке': 'schalke',
  'шальке 04': 'schalke 04',
  'нюрнберг': '1 fc nurnberg',
  '1860 мюнхен': '1860 munchen',
  'мюнхен 1860': '1860 munchen',
  'кайзерслаутерн': '1 fc kaiserslautern',
  'магдебург': '1 fc magdeburg',
  'дюссельдорф': 'dusseldorf',
  'фортуна дюссельдорф': 'fortuna dusseldorf',
  'ганновер': 'hannover',
  'ганновер 96': 'hannover 96',
  'карлсруэ': 'karlsruher sc',
  'карлсруэр': 'karlsruher',
  'падерборн': 'paderborn',
  'бохум': 'bochum',
  
  // ==================== ФРАНЦИЯ ====================
  'пари сен-жермен': 'paris saint germain',
  'псж': 'paris saint germain',
  'париж': 'paris saint germain',
  'марсель': 'marseille',
  'олимпик марсель': 'marseille',
  'лион': 'lyon',
  'олимпик лион': 'lyon',
  'монако': 'monaco',
  'ас монако': 'monaco',
  'лилль': 'lille',
  'ницца': 'nice',
  'ренн': 'rennes',
  'страсбург': 'strasbourg',
  'нант': 'nantes',
  'брест': 'brest',
  'стад брестуа': 'stade brestois 29',
  'ланс': 'lens',
  'тулуза': 'toulouse',
  'монпелье': 'montpellier',
  'лорьян': 'lorient',
  'ле гавр': 'le havre',
  'мец': 'metz',
  'осер': 'auxerre',
  'реймс': 'reims',
  'сент-этьен': 'saint etienne',
  'анже': 'angers',
  
  // ==================== ИТАЛИЯ ====================
  'ювентус': 'juventus',
  'юве': 'juventus',
  'интер': 'inter',
  'интер милан': 'inter',
  'интернационале': 'inter',
  'милан': 'milan',
  'ас милан': 'ac milan',
  'наполи': 'napoli',
  'рома': 'roma',
  'ас рома': 'as roma',
  'лацио': 'lazio',
  'аталанта': 'atalanta',
  'фиорентина': 'fiorentina',
  'болонья': 'bologna',
  'торино': 'torino',
  'удинезе': 'udinese',
  'сассуоло': 'sassuolo',
  'эмполи': 'empoli',
  'салернитана': 'salernitana',
  'дженоа': 'genoa',
  'монца': 'monza',
  'лечче': 'lecce',
  'верона': 'verona',
  'эллас верона': 'hellas verona',
  'кальяри': 'cagliari',
  'фрозиноне': 'frosinone',
  'парма': 'parma',
  'венеция': 'venezia',
  'комо': 'como',
  'сампдория': 'sampdoria',
  'палермо': 'palermo',
  'бари': 'bari',
  'кремонезе': 'cremonese',
  'брешиа': 'brescia',
  'специя': 'spezia',
  'пиза': 'pisa',
  'модена': 'modena',
  'реджина': 'reggina',
  'читтаделла': 'cittadella',
  'аскола': 'ascoli',
  
  // ==================== НИДЕРЛАНДЫ ====================
  'аякс': 'ajax',
  'псв': 'psv',
  'псв эйндховен': 'psv eindhoven',
  'эйндховен': 'psv eindhoven',
  'фейеноорд': 'feyenoord',
  'аз алкмар': 'az alkmaar',
  'аз': 'az',
  'твенте': 'twente',
  'утрехт': 'utrecht',
  'херенвен': 'heerenveen',
  'гронинген': 'groningen',
  'виллем ii': 'willem ii',
  'зволле': 'zwolle',
  'пек зволле': 'pec zwolle',
  'витесс': 'vitesse',
  'спарта': 'sparta rotterdam',
  'спарта роттердам': 'sparta rotterdam',
  'нак бреда': 'nac breda',
  'волендам': 'volendam',
  'эксельсиор': 'excelsior',
  'фортуна ситтард': 'fortuna sittard',
  'гоу эхед иглз': 'go ahead eagles',
  'телстар': 'telstar',
  'геракл': 'heracles',
  
  // ==================== ПОРТУГАЛИЯ ====================
  'бенфика': 'benfica',
  'порту': 'porto',
  'фс порту': 'fc porto',
  'спортинг': 'sporting',
  'спортинг лиссабон': 'sporting',
  'брага': 'braga',
  'спортинг брага': 'sporting braga',
  'витория гимарайнш': 'vitoria guimaraes',
  'боавишта': 'boavista',
  'жил висенте': 'gil vicente',
  'санта клара': 'santa clara',
  'фаренсе': 'farense',
  'риу аве': 'rio ave',
  'морейренсе': 'moreirense',
  'эшторил': 'estoril',
  'ароука': 'arouca',
  'каса пия': 'casa pia',
  'насьонал': 'nacional',
  
  // ==================== ТУРЦИЯ ====================
  'фенербахче': 'fenerbahce',
  'фенер': 'fenerbahce',
  'галатасарай': 'galatasaray',
  'галата': 'galatasaray',
  'бешикташ': 'besiktas',
  'бешик': 'besiktas',
  'трабзонспор': 'trabzonspor',
  'трабзон': 'trabzonspor',
  'истанбул': 'istanbul',
  'истанбул башакшехир': 'istanbul basaksehir',
  'башакшехир': 'basaksehir',
  'касымпаша': 'kasimpasa',
  'антальяспор': 'antalyaspor',
  'анталья': 'antalyaspor',
  'сивасспор': 'sivasspor',
  'сивас': 'sivasspor',
  'аланьяспор': 'alanyaspor',
  'коньяспор': 'konyaspor',
  'конья': 'konyaspor',
  'ризеспор': 'rizespor',
  'кайсериспор': 'kayserispor',
  'кайсери': 'kayserispor',
  'гёзтепе': 'goztepe',
  'адана демирспор': 'adana demirspor',
  'адана': 'adana demirspor',
  'эйюпспор': 'eyupspor',
  'бодрумспор': 'bodrumspor',
  'хатайспор': 'hatayspor',
  'газиантеп': 'gaziantep',
  'коджаэлиспор': 'kocaelispor',
  'эрокспор': 'erokspor',
  'умраниеспор': 'umraniyespor',
  'анкарагюджю': 'ankaragucu',
  'анкара': 'ankaragucu',
  'генчлербирлиги': 'genclerbirligi',
  
  // ==================== ШОТЛАНДИЯ ====================
  'селтик': 'celtic',
  'кельтик': 'celtic',
  'рейнджерс': 'rangers',
  'глазго рейнджерс': 'rangers',
  'хартс': 'hearts',
  'хартс оф мидлотиан': 'hearts',
  'сент-миррен': 'st mirren',
  'арброт': 'arbroath',
  'эйрдрионианс': 'airdrieonians',
  'абердин': 'aberdeen',
  'хиберниан': 'hibernian',
  'хибс': 'hibernian',
  'данди': 'dundee',
  'данди юнайтед': 'dundee united',
  'килмарнок': 'kilmarnock',
  'росс каунти': 'ross county',
  'ливингстон': 'livingston',
  'мазервелл': 'motherwell',
  'сент-джонстон': 'st johnstone',
  
  // ==================== РОССИЯ ====================
  'зенит': 'zenit',
  'спартак': 'spartak',
  'спартак москва': 'spartak moscow',
  'цска': 'cska',
  'цска москва': 'cska moscow',
  'локомотив': 'lokomotiv',
  'локомотив москва': 'lokomotiv moscow',
  'краснодар': 'krasnodar',
  'динамо москва': 'dynamo moscow',
  'динамо': 'dynamo',
  'рубин': 'rubin',
  'рубин казань': 'rubin kazan',
  'сочи': 'sochi',
  'ахмат': 'akhmat',
  'ахмат грозный': 'akhmat grozny',
  'ростов': 'rostov',
  'урал': 'ural',
  'крылья советов': 'krylya sovetov',
  'оренбург': 'orenburg',
  'факел': 'fakel',
  'балтика': 'baltika',
  'пари нн': 'pari nn',
  'торпедо москва': 'torpedo moscow',
  'химки': 'khimki',
  
  // ==================== УКРАИНА ====================
  'шахтер': 'shakhtar',
  'шахтёр': 'shakhtar',
  'шахтёр донецк': 'shakhtar donetsk',
  'динамо киев': 'dynamo kyiv',
  'днепр': 'dnipro',
  'заря': 'zorya',
  'заря луганск': 'zorya luhansk',
  'колос': 'kolos',
  'ворскла': 'vorskla',
  'черноморец': 'chornomorets',
  'металлист': 'metalist',
  
  // ==================== БЕЛЬГИЯ ====================
  'брюгге': 'brugge',
  'клуб брюгге': 'club brugge',
  'андерлехт': 'anderlecht',
  'генк': 'genk',
  'антверпен': 'antwerp',
  'роял антверпен': 'royal antwerp',
  'стандард': 'standard',
  'стандард льеж': 'standard liege',
  'гент': 'gent',
  'шарлеруа': 'charleroi',
  'серкль брюгге': 'cercle brugge',
  'сент-трюйден': 'st truiden',
  'юнион': 'union',
  'мехелен': 'mechelen',
  'кортрейк': 'kortrijk',
  
  // ==================== АВСТРИЯ ====================
  'ред булл зальцбург': 'red bull salzburg',
  'зальцбург': 'salzburg',
  'рапид': 'rapid',
  'рапид вена': 'rapid wien',
  'аустрия': 'austria',
  'аустрия вена': 'austria wien',
  'штурм': 'sturm',
  'штурм грац': 'sturm graz',
  'ласк': 'lask',
  'вольфсбергер': 'wolfsberger',
  'хартберг': 'hartberg',
  
  // ==================== ШВЕЙЦАРИЯ ====================
  'базель': 'basel',
  'янг бойз': 'young boys',
  'цюрих': 'zurich',
  'грассхоппер': 'grasshopper',
  'лугано': 'lugano',
  'сьон': 'sion',
  'сервет': 'servette',
  'санкт-галлен': 'st gallen',
  'люцерн': 'luzern',
  
  // ==================== ЧЕХИЯ ====================
  'спарта прага': 'sparta prague',
  'прага спарта': 'sparta prague',
  'славия': 'slavia',
  'славия прага': 'slavia prague',
  'виктория пльзень': 'viktoria plzen',
  'пльзень': 'plzen',
  'баник': 'banik',
  'баник острава': 'banik ostrava',
  'богемианс': 'bohemians',
  'либерец': 'liberec',
  
  // ==================== ПОЛЬША ====================
  'легия': 'legia',
  'легия варшава': 'legia warsaw',
  'лех': 'lech',
  'лех познань': 'lech poznan',
  'краковия': 'cracovia',
  'ракув': 'rakow',
  'ягеллония': 'jagiellonia',
  'погонь': 'pogon',
  'погонь щецин': 'pogon szczecin',
  'висла': 'wisla',
  'висла краков': 'wisla krakow',
  'шлёнск': 'slask',
  'гурник': 'gornik',
  
  // ==================== ГРЕЦИЯ ====================
  'олимпиакос': 'olympiacos',
  'паок': 'paok',
  'аек': 'aek',
  'аек афины': 'aek athens',
  'панатинаикос': 'panathinaikos',
  'арис': 'aris',
  'арис салоники': 'aris thessaloniki',
  'астерас триполис': 'asteras tripolis',
  'волос': 'volos',
  
  // ==================== СЕРБИЯ ====================
  'црвена звезда': 'crvena zvezda',
  'звезда': 'crvena zvezda',
  'партизан': 'partizan',
  'партизан белград': 'partizan',
  'войводина': 'vojvodina',
  'чукарички': 'cukaricki',
  
  // ==================== ХОРВАТИЯ ====================
  'динамо загреб': 'dinamo zagreb',
  'загреб': 'dinamo zagreb',
  'хайдук': 'hajduk',
  'хайдук сплит': 'hajduk split',
  'осиек': 'osijek',
  'риека': 'rijeka',
  
  // ==================== ДАНИЯ ====================
  'копенгаген': 'copenhagen',
  'фк копенгаген': 'fc copenhagen',
  'мидтьюлланд': 'midtjylland',
  'норшелланн': 'nordsjaelland',
  'брондбю': 'brondby',
  'орхус': 'aarhus',
  'раннерс': 'randers',
  'силькеборг': 'silkeborg',
  
  // ==================== НОРВЕГИЯ ====================
  'русенборг': 'rosenborg',
  'будё-глимт': 'bodo glimt',
  'молде': 'molde',
  'викинг': 'viking',
  'бранн': 'brann',
  'валеренга': 'valerenga',
  'лиллестрём': 'lillestrom',
  'стрёмсгодсет': 'stromsgodset',
  
  // ==================== ШВЕЦИЯ ====================
  'мальмё': 'malmo',
  'мальме': 'malmo',
  'аик': 'aik',
  'гётеборг': 'goteborg',
  'юргорден': 'djurgarden',
  'хаммарбю': 'hammarby',
  'эльфсборг': 'elfsborg',
  'норрчёпинг': 'norrkoping',
  
  // ==================== АРГЕНТИНА ====================
  'бока хуниорс': 'boca juniors',
  'бока': 'boca juniors',
  'ривер плейт': 'river plate',
  'ривер': 'river plate',
  'расинг': 'racing',
  'расинг клуб': 'racing club',
  'индепендьенте': 'independiente',
  'сан-лоренсо': 'san lorenzo',
  'эстудиантес': 'estudiantes',
  'велес сарсфилд': 'velez sarsfield',
  'аргентинос хуниорс': 'argentinos juniors',
  'ньюэллс': 'newells',
  'ньюэллс олд бойз': 'newells old boys',
  'росарио сентраль': 'rosario central',
  'ланус': 'lanus',
  'хураканы': 'huracan',
  'тальерес': 'talleres',
  'дефенса и хустисия': 'defensa y justicia',
  'банфилд': 'banfield',
  'унион': 'union',
  'унион санта-фе': 'union santa fe',
  'гимнасия': 'gimnasia',
  'годой крус': 'godoy cruz',
  'атлетико тукуман': 'atletico tucuman',
  'платенсе': 'platense',
  'тигре': 'tigre',
  'сентраль кордоба': 'central cordoba',
  
  // ==================== БРАЗИЛИЯ ====================
  'фламенго': 'flamengo',
  'палмейрас': 'palmeiras',
  'коринтианс': 'corinthians',
  'сан-паулу': 'sao paulo',
  'сантос': 'santos',
  'ботафого': 'botafogo',
  'флуминенсе': 'fluminense',
  'гремио': 'gremio',
  'интернасьонал': 'internacional',
  'атлетико минейро': 'atletico mineiro',
  'крузейро': 'cruzeiro',
  'форталеза': 'fortaleza',
  'баия': 'bahia',
  'атлетико паранаэнсе': 'athletico paranaense',
  'коритиба': 'coritiba',
  'васко да гама': 'vasco da gama',
  'васко': 'vasco da gama',
  'америка минейро': 'america mineiro',
  'куйяба': 'cuiaba',
  'гоянс': 'goias',
  'бразильенсе': 'brasiliense',
  
  // ==================== МЕКСИКА ====================
  'америка': 'america',
  'клуб америка': 'club america',
  'гвадалахара': 'guadalajara',
  'чивас': 'guadalajara',
  'крус асуль': 'cruz azul',
  'пумас': 'pumas',
  'пумас унам': 'pumas unam',
  'монтеррей': 'monterrey',
  'тигрес': 'tigres',
  'тигрес уанл': 'tigres uanl',
  'пачука': 'pachuca',
  'сантос лагуна': 'santos laguna',
  'леон': 'leon',
  'толука': 'toluca',
  
  // ==================== США ====================
  'ла гэлакси': 'la galaxy',
  'лос-анджелес': 'los angeles',
  'нью-йорк ред буллз': 'new york red bulls',
  'атланта юнайтед': 'atlanta united',
  'интер майами': 'inter miami',
  'сиэтл саундерс': 'seattle sounders',
  'портленд тимберс': 'portland timbers',
  'филадельфия юнион': 'philadelphia union',
  
  // ==================== САУДОВСКАЯ АРАВИЯ ====================
  'аль-хиляль': 'al hilal',
  'аль-наср': 'al nassr',
  'аль-иттихад': 'al ittihad',
  'аль-ахли': 'al ahli',
  'аль-шабаб': 'al shabab',
  'аль-фатех': 'al fateh',
  'аль-таавун': 'al taawoun',
  'аль-эттифак': 'al ettifaq',
  'дамак': 'damac',
  'аль-файха': 'al fayha',
  'аль-вахда': 'al wahda',
  'аль-хазм': 'al hazem',
  'аль-раед': 'al raed',
  
  // ==================== КАТАР ====================
  'аль-духаиль': 'al duhail',
  'аль-садд': 'al sadd',
  'аль-райян': 'al rayyan',
  'аль-гарафа': 'al gharafa',
  'катар': 'qatar',
  
  // ==================== ОАЭ ====================
  'аль-айн': 'al ain',
  'аль-вахда': 'al wahda',
  'аль-джазира': 'al jazira',
  'шабаб аль-ахли': 'shabab al ahli',
  
  // ==================== ЯПОНИЯ ====================
  'урава ред даймондс': 'urawa red diamonds',
  'кавасаки фронтале': 'kawasaki frontale',
  'йокогама маринос': 'yokohama f marinos',
  'виссел кобе': 'vissel kobe',
  'гамба осака': 'gamba osaka',
  'нагоя грампус': 'nagoya grampus',
  'кашима антлерс': 'kashima antlers',
  'сересо осака': 'cerezo osaka',
  'токио': 'fc tokyo',
  'фк токио': 'fc tokyo',
  'касива рейсол': 'kashiwa reysol',
  'санфречче хиросима': 'sanfrecce hiroshima',
  
  // ==================== ЮЖНАЯ КОРЕЯ ====================
  'ульсан хюндай': 'ulsan hyundai',
  'чонбук моторс': 'jeonbuk motors',
  'фк сеул': 'fc seoul',
  'сувон блювингс': 'suwon bluewings',
  'пхохан стилерс': 'pohang steelers',
  
  // ==================== КИТАЙ ====================
  'шанхай порт': 'shanghai port',
  'гуанчжоу': 'guangzhou',
  'шаньдун тайшань': 'shandong taishan',
  'пекин гоань': 'beijing guoan',
  
  // ==================== ИНДОНЕЗИЯ ====================
  'арема': 'arema',
  'арема фк': 'arema fc',
  'арема кронус': 'arema fc',
  'персиджап': 'persijap',
  'персиджап джепара': 'persijap',
  'персия': 'persija',
  'персия джакарта': 'persija',
  'псм макассар': 'psm makassar',
  'псм': 'psm makassar',
  'семен паданг': 'semen padang',
  'персиб': 'persib',
  'персиб бандунг': 'persib bandung',
  'бали юнайтед': 'bali united',
  'персебая': 'persebaya',
  'персебая сурабая': 'persebaya surabaya',
  'персик кедири': 'persik kediri',
  'персита': 'persita',
  'пусамания борнео': 'pusamania borneo',
  'борнео': 'pusamania borneo',
  'малут юнайтед': 'malut united',
  'дева юнайтед': 'dewa united',
  'бхаянгкара': 'bhayangkara',
  'бхаянгкара фк': 'bhayangkara fc',
  'персис соло': 'persis solo',
  'персис': 'persis solo',
  'псим': 'psim yogyakarta',
  'псим джокьякарта': 'psim yogyakarta',
  'псбс': 'psbs biak numfor',
  'персепам': 'persepam madura utd',
  
  // ==================== СИНГАПУР ====================
  'альбирекс ниигата': 'albirex niigata s',
  'альбирекс ниигата с': 'albirex niigata s',
  'гейланг': 'geylang international',
  'гейланг интернэшнл': 'geylang international',
  'лион сити': 'lion city sailors',
  'балестье халса': 'balestier khalsa',
  
  // ==================== АВСТРАЛИЯ ====================
  'сидней': 'sydney fc',
  'сидней фк': 'sydney fc',
  'мельбурн виктори': 'melbourne victory',
  'мельбурн сити': 'melbourne city',
  'вестерн юнайтед': 'western united',
  'сентрал кост маринерс': 'central coast mariners',
  'ньюкасл джетс': 'newcastle jets',
  'аделаида юнайтед': 'adelaide united',
  'перт глори': 'perth glory',
  'брисбен роар': 'brisbane roar',
  'веллингтон феникс': 'wellington phoenix',
  'макартур': 'macarthur',
  'аделаида кобрас': 'adelaide cobras',
  'аделаида кометс': 'adelaide comets',
  
  // ==================== СЕВЕРНАЯ ИРЛАНДИЯ ====================
  'гленторан': 'glentoran',
  'колрейн': 'coleraine',
  'линфилд': 'linfield',
  'крузейдерс': 'crusaders',
  'клифтонвилл': 'cliftonville',
  'лейн': 'larne',
  
  // ==================== УЭЛЬС ====================
  'тнс': 'tns',
  'нью сейнтс': 'new saints',
  'бала': 'bala town',
  'бала таун': 'bala town',
  'барри': 'barry town',
  'коннас кей': 'connah quay',
  'кернарфон': 'caernarfon town',
  
  // ==================== ИЗРАИЛЬ ====================
  'маккаби хайфа': 'maccabi haifa',
  'маккаби тель-авив': 'maccabi tel aviv',
  'хапоэль беэр-шева': 'hapoel beer sheva',
  'хапоэль тель-авив': 'hapoel tel aviv',
  'бейтар иерусалим': 'beitar jerusalem',
  'кфар-касем': 'kfar qasem',
  
  // ==================== ПАРАГВАЙ ====================
  'олимпия': 'olimpia',
  'серро портеньо': 'cerro porteno',
  'либертад': 'libertad',
  'либертад асунсьон': 'libertad asuncion',
  'гуарани': 'guarani',
  'клуб гуарани': 'club guarani',
  'насьональ асунсьон': 'nacional asuncion',
  'соль де америка': 'sol de america',
  'спортиво тринидасенсе': 'sportivo trinidense',
  'рубио ню': 'rubio nu',
  'депортиво реколета': 'deportivo recoleta',
  
  // ==================== ДРУГИЕ СТРАНЫ ====================
  // Парагвай дополнительно
  '12 де октубре': '12 de octubre',
  '3 де фебреро': '3 de febrero',
  
  // Колумбия
  'атлетико насьональ': 'atletico nacional',
  'мильонариос': 'millonarios',
  'депортиво кали': 'deportivo cali',
  'америка де кали': 'america de cali',
  'санта фе': 'santa fe',
  'хуниор': 'junior',
  
  // Перу
  'алианса лима': 'alianza lima',
  'университарио': 'universitario',
  'спортинг кристал': 'sporting cristal',
  
  // Уругвай
  'пеньяроль': 'penarol',
  'насьональ': 'nacional',
  'насьональ монтевидео': 'nacional',
  'дефенсор спортинг': 'defensor sporting',
  'данубио': 'danubio',
  
  // Чили
  'коло-коло': 'colo colo',
  'универсидад чили': 'universidad de chile',
  'универсидад католика': 'universidad catolica',
  
  // Эквадор
  'барселона гуаякиль': 'barcelona sc',
  'лду кито': 'ldu quito',
  'индепендьенте дель валье': 'independiente del valle',
  'эмелек': 'emelec',
  
  // ==================== ДОПОЛНИТЕЛЬНЫЕ МАППИНГИ ====================
  // === МАППИНГИ ДЛЯ НЕСОПОСТАВЛЕННЫХ КОМАНД (добавлено для 308 unmatched) ===
  // Германия Бундеслига 3
  'дуйсбург': 'msv duisburg',
  'ферль': 'verl',
  // Бразилия
  'шапекоенсе': 'chapecoense sc',
  'крисиума': 'criciuma',
  'насьонал манаус': 'nacional',
  'амазонас': 'amazonas',
  'куяба': 'cuiaba',
  'варзеа-гранди': 'varzea grande',
  'интернасьонал рс': 'internacional',
  'интернасьонал санта-мария': 'inter sm',
  'авенида': 'avenida',
  'гуарани баже': 'guarani bage',
  'монсоон': 'monsoon',
  'жакареи': 'jacarei',
  'интер бебедоуро': 'inter bebedouro',
  'атлетика гуарани': 'atletica guarani',
  'деспортива аракажу': 'desportiva aracaju',
  // Дания
  'сендерюске': 'sonderjyske',
  'норшелланн': 'fc nordsjaelland',
  // Венгрия
  'козармишлень': 'kozarmisleny',
  'сентлеринц': 'szentlorincse',
  // Гибралтар
  'хаунд догс': 'hound dogs',
  'глэсис юнайтед': 'glacis united',
  // Гондурас
  'олимпия ла энтрада': 'olimpia la entrada',
  'вида': 'vida',
  // Египет
  'эль-аламейн': 'el alamein',
  'эль-минья': 'el minya',
  // Гватемала
  'депортиво антигуа': 'antigua gfc',
  'депортиво микско': 'mixco',
  'депортиво ипала': 'deportivo iztapa',
  'депортиво карча': 'deportivo carcha',
  'депортиво коатепеке': 'deportivo coatepeque',
  'депортиво сан-педро': 'deportivo san pedro',
  'депортиво истапа': 'deportivo iztapa',
  'депортиво аютла': 'deportivo ayutla',
  'депортиво чиантла': 'deportivo chiantla',
  'депортиво сан-себастьян': 'deportivo san sebastian',
  'депортиво такана': 'deportivo tacana',
  'санта лусия коцумальгуапа': 'santa lucia cotzumalguapa',
  'уэуэтекос': 'huehuetenango',
  'драко': 'draco',
  'ла амистад': 'la amistad',
  // Гамбия
  'фэлконс': 'falcons',
  'тим рино': 'team rhino',
  // Азербайджан
  'имишли': 'mil mugan',
  'мил-муган': 'mil mugan',
  'кяпаз': 'kapaz',
  // Испания - Терсера и ниже
  'оспиталет': 'l hospitalet',
  'ла-эскала': 'l escala',
  'лас-пальмас 2': 'las palmas ii',
  // Италия
  'ольтрепо': 'oltrepo',
  'леон монца': 'leon monza e brianza',
  // Сингапур
  'янг лайонс': 'young lions',
  'лайон сити сейлорс': 'lion city sailors',
  // Камбоджа
  'лайф сиануквиль': 'life sihanoukville',
  'ангкор тайгер': 'angkor tiger',
  // Бельгия
  'абе ла нев': 'aische en refail',
  'ауд-хеверле левен': 'oud heverlee leuven',
  'юнион намюр': 'union namur',
  'ренессанс монс 44': 'renaissance mons',
  'унион рошфортуаз': 'union rochefortoise',
  // Бразилия
  'атлетико линенсе': 'linense',
  'франкана': 'francana',
  'унио сузано': 'usac',
  'оэсте': 'oeste',
  // Португалия
  'навал': 'naval 1893',
  'лузитания асорес': 'lusitania',
  // Молдова/Украина friendlies
  'карпаты львов': 'karpaty',
  'карпаты': 'karpaty',
  'стьярнан': 'stjarnan',
  // Шериф
  'шериф 2 тирасполь': 'sheriff ii',
  'зимбру': 'zimbru',
  // Финляндия
  'сик 2 сейнейоки': 'sjk akatemia',
  'пк-35 хельсинки': 'pk 35',
  'пк-35': 'pk 35',
  // Андорра
  'фк санта-колома': 'fc santa coloma',
  'каррой': 'carroi',
  'каса-де-португал': 'casa de portugal',
  // Франция
  'сошо': 'sochaux',
  'труа': 'troyes',
  'анже': 'angers',
  'стад ренн': 'stade rennais',
  'сент-этьен': 'saint etienne',
  'асптт дижон': 'asptt dijon',
  'ле ман': 'le mans',
  'сен-мало': 'saint malo',
  // Греция
  'астерас триполис': 'asteras tripolis',
  'паниониос': 'panionios',
  'паок': 'paok',
  'волос 2004': 'volos nfc',
  'волос': 'volos nfc',
  'эллас сирос': 'ellas syros',
  // Гонконг
  'шам шуй по': 'sham shui po',
  'ситизен': 'citizen aa',
  'истерн атлетик': 'eastern athletic',
  'гонконг рейнджерс': 'hong kong rangers',
  'шатин': 'sha tin',
  'саут чайна': 'south china',
  'тунг-синг': 'tung sing',
  'суприм': 'supreme',
  'коулун сити': 'kowloon city',
  'ли ман': 'lee man',
  'сентрал-вестерн': 'central western',
  'вофу се': 'wo foo',
  'фу мунь': 'fu moon',
  'вонг тай син': 'wong tai sin',
  'туэнь мун са': 'tuen mun sa',
  'фукиен': 'fukien',
  'айлендс': 'islands',
  'сити линкерс': 'city linkers',
  // Турция 3-я лига
  'османиеспор': 'osmaniyespor',
  'ниджде': 'nigde',
  'чаелиспор': 'cayelispor',
  'дюзджеспор': 'duzcespor',
  // Индонезия
  'персия джакарта': 'persija jakarta',
  'псбс биак': 'psbs biak numfor',
  'ранс нусантара': 'rans nusantara',
  'деджан': 'dejan',
  // Бахрейн
  'аль-хала мухаррак': 'al hala',
  'иса таун': 'isa town',
  'ист риффа': 'east riffa',
  'аль-бусайтин': 'al busaiteen',
  'аль-иттифак макаба': 'al ittifaq',
  'бури': 'buri',
  'этихад аль-риф': 'al rif',
  'калали': 'galali',
  'умм аль-хассам': 'umm al hassam',
  'манама': 'manama',
  'аль-тадамун бури': 'al tadamun',
  'аль-иттихад': 'al ittihad',
  // Шотландия женщины
  'ист файф': 'east fife',
  'бороумир тисл': 'boroughmuir thistle',
  // Турция женщины
  'чекмекой бильгидога': 'cekmekoy',
  // Гватемала
  'ла амистад': 'la amistad',
  'атлетико боксинг': 'atletico boxing',
  // Аргентина региональная
  'эскобар': 'escobar',
  'колон чивилькой': 'colon chivilcoy',
  'ферро хенераль пико': 'ferro general pico',
  'расинг олаваррия': 'racing olavarria',
  'сентраль архентино': 'central argentino',
  'хенераль пас хуниорс': 'general paz juniors',
  'бен ур': 'ben hur',
  'хувентуд унида гуалегуайчу': 'juventud unida gualeguaychu',
  // Кипр женщины
  'омония никосия': 'omonia nicosia',
  'аполлон лимасол': 'apollon limassol',
  // Австралия
  'перт ред стар': 'perth red star',
  'фримантл сити': 'fremantle city',
  'балкатта': 'balcatta',
  'олимпик кингсувэй': 'olympic kingsway',
  'сабиако': 'subiaco',
  'норт бич': 'north beach',
  'флорит афина': 'floreat athena',
  'балга': 'balga',
  'макартур рэмс': 'macarthur rams',
  'вестерн сити рейнджерс': 'western city wanderers',
  // Вьетнам
  'чыонг туой донг най': 'dong nai',
  // Ирландия
  'бангор селтик': 'bangor celtic',
  'вэйсайд селтик': 'wayside celtic',
  // Кения женщины
  'кения': 'kenya',
  // Беране/Подгорица
  'беране': 'berane',
  'ком подгорица': 'kom podgorica',
  // Кипр
  'апоэл': 'apoel',
  'апоэл никосия': 'apoel nicosia',
  'омония': 'omonia',
  'омония никосия': 'omonia nicosia',
  'анортосис': 'anorthosis',
  'аэл лимассол': 'ael limassol',
  
  // Греция
  'олимпиакос пирей': 'olympiakos',
  'паок салоники': 'paok',
  'ари': 'aris',
  
  // Саудовская Аравия
  'аль хиляль': 'al-hilal',
  'аль наср': 'al-nassr',
  'аль ахли': 'al-ahli',
  'аль иттихад': 'al-ittihad',
  'аль-таавон': 'al-taawon',
  
  // Хорватия
  
  // Сербия
  'красная звезда': 'crvena zvezda',
  
  // Румыния
  'фксб': 'fcsb',
  'стяуа': 'fcsb',
  'стяуа бухарест': 'fcsb',
  'клуж': 'cfr cluj',
  'кфр клуж': 'cfr cluj',
  'рапид бухарест': 'rapid bucharest',
  'университатя крайова': 'universitatea craiova',
  
  // Польша
  'ягеллония белосток': 'jagiellonia',
  
  // Португалия доп.
  'эштрела': 'estrela',
  'эштрела амадора': 'estrela',
  
  // Дания
  'мидтъюлланн': 'midtjylland',
  'брённбю': 'brondby',
  'нордшелланн': 'nordsjaelland',
  
  // Швеция
  'ифк гётеборг': 'ifk goteborg',
  
  // Норвегия
  'будё глимт': 'bodo glimt',
  'бодо глимт': 'bodo glimt',
  'мольде': 'molde',
  
  // Израиль
  'хапоэль': 'hapoel',
  
  // Китай, Япония, Корея
  'шанхай': 'shanghai',
  'иокогама': 'yokohama',
  'кавасаки': 'kawasaki',
  'кашима': 'kashima',
  'сеул': 'seoul',
  'ульсан': 'ulsan',
  'чонбук': 'jeonbuk',

  // ==================== МАЛЬТА ====================
  'гудья юнайтед': 'gudja united',
  'гудья': 'gudja united',
  'свики юнайтед': 'swieqi united',
  'свики': 'swieqi united',
  'валлетта': 'valletta',
  'хибернианс': 'hibernians',
  'слима уондерерс': 'sliema wanderers',
  'слима': 'sliema wanderers',
  'биркиркара': 'birkirkara',
  'хамрун спартанс': 'hamrun spartans',
  'хамрун': 'hamrun spartans',
  'флориана': 'floriana',
  'гзира юнайтед': 'gzira united',
  'гзира': 'gzira united',
  'балзан': 'balzan',

  // ==================== ГИБРАЛТАР ====================
  'монс кальпе': 'mons calpe',
  'европа поинт': 'europa point',

  // ==================== ДАНИЯ (доп.) ====================
  'агф орхус': 'aarhus',
  'агф': 'aarhus',
  'виборг': 'viborg',
  'люнгбю': 'lyngby',
  'вайле': 'vejle',
  'хвидовре': 'hvidovre',
  'сённерйюске': 'sonderjyske',
  'оденсе': 'odense',

  // ==================== АРГЕНТИНА (доп.) ====================
  'барракас сентраль': 'barracas central',
  'химнасия ла-плата': 'gimnasia la plata',
  'химнасия': 'gimnasia',

  // ==================== ПАРАГВАЙ (доп.) ====================
  'олимпия асунсьон': 'olimpia asuncion',

  // ==================== КОЛУМБИЯ (доп.) ====================
  'атлетико кали': 'atletico cali',
  'интернасиональ пальмира': 'internacional palmira',
  'депортиво гарсиласо': 'deportivo garcilaso',

  // ==================== ПЕРУ (доп.) ====================
  'кахамарка': 'cajamarca',

  // ==================== СЕВЕРНАЯ ИРЛАНДИЯ (доп.) ====================
  'бангор': 'bangor',
  'гленавон': 'glenavon',
  'каррик рейнджерс': 'carrick rangers',

  // ==================== ФРАНЦИЯ (доп.) ====================
  'амьен': 'amiens',
  'клермон': 'clermont foot',
  'кевийи': 'quevilly',
  'родез': 'rodez',

  // ==================== ИТАЛИЯ (доп.) ====================
  'кортичелла': 'corticella',
  'сальсомаджоре': 'salsomaggiore',

  // ==================== АНГЛИЯ (доп.) ====================
  'мидлсбро': 'middlesbrough',
  'суиндон супермарин': 'swindon supermarine',
  'инкберроу': 'inkberrow',
  'лафборо лайтнинг': 'loughborough lightning',
  'лафборо': 'loughborough',
  'биллерикей таун': 'billericay town',
  'мейденхед юнайтед': 'maidenhead united',
  'уэртинг': 'worthing',
  'гвалиа юнайтед': 'gwalia united',

  // ==================== ГРЕЦИЯ (доп.) ====================
  'паниониос': 'panionios',
  'эллас сирос': 'ellas syros',

  // ==================== УГАНДА ====================
  'кулува рэйнбо': 'kuluva rainbow',
  'нтугасазе': 'ntugasaze',

  // ==================== ШОТЛАНДИЯ (доп.) ====================
  'ист файф': 'east fife',
  'бороумир тисл': 'boroughmuir thistle',

  // ==================== ИЗРАИЛЬ (доп.) ====================
  'хапоэль раанана': 'hapoel raanana',
  'маккаби кирьят-гат': 'maccabi kiryat gat',
  'аса тель-авив': 'asa tel aviv',
  'маккаби кишронот хадера': 'maccabi kishronot hadera',
  'хапоэль иерусалим': 'hapoel jerusalem',
  'маккаби холон': 'maccabi holon',

  // ==================== БРАЗИЛИЯ (доп.) ====================
  'аваи': 'avai',
  'камбориу': 'camboriu',
  'синоп': 'sinop',
  'шападау': 'chapada',
  'флуминенсе рж': 'fluminense',
  'васко да гама рж': 'vasco da gama',
  'ботафого рж': 'botafogo',
  'интернасьонал рс': 'internacional',
  'трезе': 'treze',
  'кампиненсе': 'campinense',
  'капивариано': 'capivariano',
  'мирасол': 'mirassol',
  'марика': 'marica',
  'какоаленсе': 'uniao cacoalense',
  'порту-велью': 'porto velho',
  'фламенго рж': 'flamengo',
  'насьонал манаус': 'manaus fc',
  'амазонас': 'amazonas',
  'сан луис ижуи': 'san luis',

  // ==================== АРГЕНТИНА (доп. 2) ====================
  'уракан': 'huracan',
  'сан-лоренсо альмагро': 'san lorenzo',
  'бен ур': 'ben hur',
  'хувентуд унида гуалегуайчу': 'juventud unida gualeguaychu',

  // ==================== ТУРЦИЯ (доп.) ====================
  'газиантеп бб': 'gaziantep fk',
  'газиантеп бб u19': 'gaziantep fk',
  'касымпаша u19': 'kasimpasa',
  'кайсериспор u19': 'kayserispor',
  'коджаэлиспор u19': 'kocaelispor',
  'сакарьяспор': 'sakaryaspor',
  'эрзурумспор бб': 'erzurum bb',
  'эрзурумспор': 'erzurumspor',
  'себат генчликспор': 'sebat genclikspor',
  'гиресунспор': 'giresunspor',
  'амасьяспор': 'amasyaspor',
  'зонгулдакспор': 'zonguldak komurspor',
  'картал булварспор': 'kartal bulvarspor',
  'инегел кафкас генчлик': 'inegol kafkas genclik',
  'каракепрю беледиеси': 'karakopru belediyespor',
  'диярбекырспор': 'diyarbekirspor',
  'полатлы беледиеспор': 'polatli belediyespor',
  'инкылапспор': 'inkilapspor',
  'силивриспор': 'silivrispor',
  'аданаспор': 'adanaspor',
  'кахраманмараш истиклялспор': 'kahramanmaras istiklalspor',
  'алиага': 'aliaga fk',
  'сомаспор': 'somaspor',
  'арнавуткей': 'arnavutkoy belediyespor',
  'гюзиде гебзеспор': 'belediye derincespor',
  'назилли беледиеспор': 'nazilli belediyespor',
  'секеспор 1970': 'soke 1970',
  'бурса нилюфер': 'bursa nilufer',
  'бейкоз ишаклыспор': 'beykoz ishaklispor',
  'йозгатспор 1959': 'yozgatspor',
  'карабук идманюрду': 'karabuk idman yurdu',
  'караджабей беледиеспор': 'karacabey belediyespor',
  'адана 1954': 'adana 1954 fk',
  'измир чорохул': 'izmir corohul',
  'тире 2021': 'tire 2021 fk',

  // ==================== ИСПАНИЯ (доп. 2) ====================
  'расинг сантандер': 'racing santander',
  'мирандес': 'mirandes',

  // ==================== ПОРТУГАЛИЯ (доп.) ====================
  'фамаликан': 'famalicao',
  'авс': 'avs',
  'портимоненсе': 'portimonense',
  'бенфика 2': 'benfica b',

  // ==================== РУМЫНИЯ (доп.) ====================
  'фк динамо бухарест': 'dinamo bucuresti',
  'динамо бухарест': 'dinamo bucuresti',
  'университатя крайова': 'universitatea craiova',

  // ==================== ПОЛЬША (доп.) ====================
  'пяст гливице': 'piast gliwice',
  'висла плоцк': 'wisla plock',
  'хробры глогув': 'chrobry glogow',
  'сталь жешув': 'stal rzeszow',


  // ==================== SHORT FORMS / SCOUT ABBREVIATIONS ====================
  'minnesota': 'minnesota united',
  'kansas city': 'sporting kansas city',
  'sporting kc': 'sporting kansas city',
  'sporting jax': 'sporting jacksonville',
  'encarnacion': 'encarnacion',
  'olimpic': 'olympique',
  'olympic': 'olympique',
  'nova': 'nova iguacu',
  'hassania': 'hassania agadir',
  'aguara': 'aguara',
  'atletico nacional': 'atletico nacional',
  'futuro fc': 'future fc',
  'xv de piracicaba sp': 'xv de piracicaba',

  // ==================== НИДЕРЛАНДЫ (доп.) ====================
  'йонг аз алкмаар': 'jong az alkmaar',
  'йонг псв эйндховен': 'jong psv',
  'дордрехт': 'dordrecht',
  'осс': 'fc oss',
  'эммен': 'emmen',
  'камбур': 'cambuur',

  // ==================== СЕРБИЯ (доп.) ====================
  'офк белград': 'ofk beograd',

  // ==================== АНГЛИЯ (доп. 2) ====================
  'чарльтон атлетик': 'charlton athletic',

  // ==================== ИТАЛИЯ (доп. 2) ====================

  // ==================== ДАНИЯ (доп. 2) ====================
  'фредерисия': 'fc fredericia',

  // ==================== САУД. АРАВИЯ (доп.) ====================
  'аль-батин': 'al baten',
  'аль-ула': 'al ula',
  'аль-джандал': 'al jandal',
  'аль-дирия': 'al diriyah',
  'абха': 'abha',
  'аль-зульфи': 'al zulfi',
  'аль-джабалайн': 'al jabalain',
  'аль-букайрия': 'al bukayriyah',
  'эль джубайль': 'al jubail',
  'аль-оруба': 'al orubah',
  'аль-адалх': 'al-adalah',
  'аль-халедж сайхат': 'al khaleej saihat',
  'аль-иттихад джидда': 'al ittihad',

  // ==================== БАХРЕЙН ====================
  'умм аль-хассам': 'umm al hassam',
  'манама': 'manama',
  'аль-тадамун бури': 'al tadamon',
  'этихад аль-риф': 'etehad al reef',
  'калали': 'kalali',

  // ==================== КОЛУМБИЯ (доп. 2) ====================
  'энвигадо': 'envigado',
  'тигрес богота': 'tigres bogota',
  'реал соача кундинамарка': 'real soacha',
  'леонес': 'leones fc',
  'барранкилья фк': 'barranquilla fc',
  'реал сантандер': 'real santander',
  'альянса вальедупар': 'alianza valledupar',
  'онсе кальдас': 'once caldas',

  // ==================== ПЕРУ (доп. 2) ====================
  'альянса лима': 'alianza lima',
  'комерсьентес унидос': 'comerciantes unidos',

  // ==================== САЛЬВАДОР ====================
  'фас': 'fas',
  'сакатеколука': 'zacatecoluca',
  'агила сан-мигель': 'aguila',
  'мунисипаль лимено': 'municipal limeno',
  'эркулес': 'cd hercules',
  'альянса сальвадор': 'alianza fc',
  'платенсе мунисипаль сакатеколука': 'platense municipal',
  'какауатике': 'cacahuatique',

  // ==================== ГОНДУРАС ====================
  'марафон': 'cd marathon',
  'реал эспана': 'real espana',

  // ==================== КОСТА-РИКА ====================
  'спортинг сан-хосе': 'sporting san jose',
  'гуадалупе': 'guadalupe fc',

  // ==================== ЧИЛИ (доп.) ====================
  'кобрелоа': 'cobreloa',
  'антофагаста': 'antofagasta',

  // ==================== МЕКСИКА (доп.) ====================
  'толука 2': 'toluca',

  // ==================== ЕГИПЕТ ====================
  'аль-наср тааден': 'al nasr',
  'аль-олимпи': 'al olympi',
  'тамеа': 'tamea',
  'голден гейт': 'golden gate',
  'фк тим': 'fc team',
  'файюм': 'fayoum',
  // === ДОПОЛНИТЕЛЬНЫЕ МАППИНГИ 4 (auto-added 2026-02-09 - batch 2) ===
  // Испания - Терсера доп.
  'больульос': 'bollullos',
  'кордоба 2': 'cordoba ii',
  'кордоба ii': 'cordoba ii',
  'харайс': 'jaraiz',
  'каламонте': 'calamonte',
  'пуэртольяно': 'puertollano',
  'ильескас': 'illescas',
  'лас-росас 2': 'las rozas',
  'дагансо': 'daganzo',
  'ольерия': 'olleria',
  'бениганим': 'beniganim',
  'итурригорри': 'iturrigorri',
  'умия': 'umia',
  'понтеведра 2': 'pontevedra ii',
  'редован': 'redovan',
  'олимпик хатива': 'olympic xativa',
  'мартиненк': 'martinenc',
  'сан-хуан монткада': 'san juan de montcada',
  'бенидорм': 'benidorm',
  'хавеа': 'javea',
  'фуэнлабрада 2': 'fuenlabrada ii',
  'интер вальдеморо': 'inter valdemoro',
  'бадахос 2': 'badajoz ii',
  'уп барбано': 'barbano',
  'эльмантико': 'elmantico',
  'бенавенте': 'benavente',
  'амуррио': 'amurrio',
  'культураль абетуксуко': 'cultural abetxuko',
  'райо ибенсе': 'rayo ibense',
  'мучамель': 'muchamiel',
  'вильяверде': 'villaverde',
  'сьелло': 'ciello',
  'гран пенья': 'gran pena',
  'монтаньерос': 'montaneros',
  'луго 2': 'lugo ii',
  'ароса': 'arosa',
  'алертанавия': 'alertanavia',
  'больюльос': 'bollullos',
  // Мьянма
  'дагон стар юнайтед': 'dagon',
  'испе': 'i.s.p.e',
  // Италия - доп. 2
  'портичи': 'portici',
  'путеолана 1902': 'puteolana 1902',
  'кортичелла': 'corticella',
  'сальсомаджоре': 'salsomaggiore',
  'галатин': 'galatina',
  'битонто': 'bitonto',
  'академи трапани': 'trapani',
  'ликата': 'licata',
  'полиспортива феррини кальяри': 'ferrini cagliari',
  'ильвамаддалена': 'ilvamaddalena',
  'стерпаро': 'sterparo',
  'арче 1932': 'arce 1932',
  'роккасекка т. сан-томмазо': 'roccasecca',
  'тиволи': 'tivoli',
  // Бразилия - доп. 2
  'варзеа-гранди': 'varzea grande',
  // Товарищеские
  'депортиво аукас': 'aucas',
  'текнико университарио': 'tecnico universitario',
  'шериф 2 тирасполь': 'sheriff ii',
  'зимбру 2': 'zimbru ii',
  'беране': 'berane',
  'ком подгорица': 'kom',
  // Северная Ирландия - резервы
  'линфилд (р)': 'linfield',
  'клифтонвилл (р)': 'cliftonville',
  'гленавон (р)': 'glenavon',
  'каррик рейнджерс (р)': 'carrick rangers',
  'бангор (р)': 'bangor city',
  'гленторан (р)': 'glentoran',
  // Андорра
  'фц санта-колома 2': 'fc santa coloma ii',
  'фк санта-колома 2': 'fc santa coloma ii',
  'каса-де-португал': 'casa de portugal',

  // ==================== АЗЕРБАЙДЖАН (доп.) ====================
  'туран товуз': 'turan tovuz',
  'карван': 'karvan',
  'имишли': 'mil mugan',
  'кяпаз': 'kapaz',

  // ==================== ИЗРАИЛЬ (доп. 2) ====================
  'маккаби петах-тиква': 'maccabi petah tikva',
  'маккаби кабилио яффа': 'maccabi kabilio jaffa',
  'бней йегуда': 'bnei yehuda',
  'хапоэль акко': 'hapoel akko',
  'маккаби бней-рейне': 'maccabi bnei raina',
  'маккаби ирони кирьят-ата': 'maccabi ironi kiryat ata',
  'хапоэль ноф хагалиль': 'hapoel nof hagalil',

  // ==================== КИПР (доп.) ====================
  'омония арадипу': 'omonia aradippou',
  'акритас хлорака': 'akritas chlorakas',
  'красава': 'krasava',
  'аел лимасол': 'ael limassol',
  'арис лимасол': 'aris limassol',
  'анортосис фамагуста': 'anorthosis famagusta',

  // ==================== ЛИГА ЧЕМПИОНОВ АЗИИ ====================
  'аль-шарджа': 'al sharjah',
  'шабаб аль-ахли дубай': 'shabab al ahli dubai',
  'аль-хиляль эр-рияд': 'al hilal',
  'насаф': 'nasaf',
  'аль-шорта багдад': 'al shorta',
  'аль-вахда абу-даби': 'al wahda',
  'аль-ахли джидда': 'al ahli',

  // ==================== ТУНИС ====================
  'мсакен': 'msaken',
  'юнион спортив татуин': 'us tataouine',
  'керкенна': 'kerkennah',
  'сакие эдде': 'sakiet eddaier',

  // ==================== ЭФИОПИЯ ====================
  'фасил кенема': 'fasil ketema',
  'хадия хоссана': 'hadiya hosaena',

  // ==================== ТАНЗАНИЯ ====================
  'джкт танзания': 'jkt tanzania',
  'машуджа': 'mashujaa',

  // ==================== КЕНИЯ ====================
  'найроби юнайтед': 'nairobi united',
  'мара шугар': 'mara sugar',

  // ==================== КАМЕРУН ====================
  'фов азур элит': 'fovu azur elite',
  'баменда': 'pwd bamenda',

  // ==================== СЕНЕГАЛ ====================
  'хлм дакар': 'hlm dakar',
  'сонакос': 'sonacos',

  // ==================== ГАМБИЯ ====================
  'серрекунда': 'serrekunda',
  'банжул юнайтед': 'banjul united',
  'гамбия армед форсес': 'gambia armed forces',
  'уоллидан': 'wallidan',

  // ==================== ВЬЕТНАМ ====================
  'нам динь': 'nam dinh',
  'хонглинь хатинь': 'hong linh ha tinh',

  // ==================== СИНГАПУР (доп.) ====================
  'хуганг юнайтед': 'hougang united',

  // ==================== ТАИЛАНД (доп.) ====================
  'лампхун уорриор': 'lamphun warrior',
  'канчанабури': 'kanchanaburi',
  'чайнат хорнбилл': 'chainat hornbill',
  'чиангмай юнайтед': 'chiangmai united',
  'бангкок': 'bangkok',
  'касетсарт': 'kasetsart fc',

  // ==================== ГОНКОНГ ====================
  'краунити норт дистрикт': 'north district',
  'истерн дистрикт': 'eastern district',

  // ==================== ИНДИЯ ====================
  'мумбаи сити': 'mumbai city',

  // ==================== ПАРАГВАЙ (доп. 2) ====================

  // ==================== ТОВАРИЩЕСКИЕ ====================
  'индепендьенте петролеро': 'independiente petrolero',
  'реал томаяпо': 'real tomayapo',

  // ==================== ДОБАВЛЕНИЯ (ROUND 3) ====================
  // Италия
  'ареццо': 'arezzo',
  'пьянезе': 'pianese',
  'кьети': 'chieti',
  'сан николо': 'notaresco',
  'ночерина': 'nocerina',
  'пальмези 1914': 'palmese',
  'галатин': 'galatina',
  'битонто': 'bitonto',
  'стерпаро': 'sterparo',
  'арче 1932': 'arce 1932',

  // Испания
  'осасуна 2': 'osasuna ii',
  'касереньо': 'cacereno',
  'монтаньеса': 'montanesa',
  'корнелья': 'cornella',
  'луго 2': 'lugo ii',
  'ароса': 'arosa',
  'вильяверде': 'villaverde',
  'мексико': 'mexico',
  'гран пенья': 'gran pena',
  'монтаньерос': 'montaneros',
  'онтеньенте': 'ontinyent',
  'хове эспаньол': 'jove espanyol',
  'бенидорм': 'benidorm',
  'хавеа': 'javea',
  'ольерия': 'olleria',
  'бениганим': 'beniganim',
  'уд сан-мауро': 'ud san mauro',
  'сиудад кооператива': 'ciudad cooperativa',
  'лас-росас 2': 'las rozas',
  'дагансо': 'daganzo',
  'мерида': 'merida',
  'самора': 'zamora',

  // Бельгия
  'сент-трейден 2': 'sint-truiden ii',
  'берхем': 'berchem sport',

  // Уругвай
  'хувентуд лас-пьедрас': 'juventud',
  'серро-ларго': 'cerro largo',

  // Индонезия

  // Молдова
  'шериф 2 тирасполь': 'sheriff ii',
  'зимбру 2': 'zimbru ii',

  // Словения
  'олимпия любляна': 'olimpija ljubljana',
  'целе': 'celje',

  // Швейцария
  'серветт': 'servette fc',
  'фк цюрих': 'fc zurich',

  // Венгрия
  'шорокшар': 'soroksar',
  'карцаги': 'karcagi',
  'пуща неполомице': 'puszcza niepolomice',
  'гурник ленчна': 'gornik leczna',

  // Австралия
  'перт ред стар': 'perth red star',
  'фримантл сити': 'fremantle city',
  'сабиако': 'subiaco',
  'норт бич': 'north beach',

  // Южная Африка
  'янг пайретс': 'ts galaxy u23',
  'орландо пайретс': 'orlando pirates',

  // Португалия
  'машику': 'machico',
  'шавиш 2': 'chaves ii',

  // Франция
  'сент-этьен 2': 'saint-etienne ii',
  'орлеан 2': 'orleans ii',
  'бобиньи-баньоле-ганьи': 'bobigny',
  'стад ренн': 'rennes',

  // Гонконг
  'тунг-синг': 'tung sing',
  'суприм': 'supreme',
  'шатин': 'sha tin',
  'саут чайна': 'south china',
  'шам шуй по': 'sham shui po',
  'ситизен': 'citizen',
  'вонг тай син': 'wong tai sin',
  'фу мунь': 'fu moon',
  'туэнь мун са': 'tuen mun sa',
  'фукиен': 'fukien',

  // Сент-Китс
  'сэнди пойнт': 'sandy point',
  'хонда ньютаун юнайтед': 'honda newtown united',

  // Турция (доп. 2)
  'шанлыурфаспор': 'sanliurfaspor',
  'искендерун': 'erzin spor',

  // Бразилия (доп. 2)
  'коринтианс сп': 'corinthians',
  'палмейрас сп': 'palmeiras',
  'монсоон': 'monsoon',
  'интернасьонал санта-мария': 'internacional sm',

  // Сальвадор резерв
  'агила сан-мигель (p)': 'aguila',
  'мунисипаль лимено (р)': 'municipal limeno',
  'фас (р)': 'fas',
  'сакатеколука (р)': 'zacatecoluca',
  'эркулес (р)': 'cd hercules',
  'альянса сальвадор (р)': 'alianza fc',
  'платенсе мунисипаль сакатеколука (р)': 'platense municipal',
  'какауатике (р)': 'cacahuatique',

  // Малайзия
  'перак': 'perak',
  'джохор дарул такзим 2': 'johor darul ta zim ii',
  'джохор дарул такзим': 'johor darul ta zim',

  // Шотландия (ж)
  'глазго сити': 'glasgow city',

  // Ливан
  'аль-ахед': 'al ahed',
  'сагессе': 'sagesse',

  // Мексика (доп.)
  'лобос улм 2': 'lobos ulmx',
  'минерос сакатекас 3': 'mineros zacatecas',

  // Ирландия
  'бангор селтик': 'bangor celtic',

  // Аргентина (доп. 3)
  'эскобар': 'escobar',
  'колон чивилькой': 'colon chivilcoy',

  // Замбия
  'чирунду юнайтед': 'chirundu united',

  // Бахрейн (доп.)
  'ист риффа': 'east riffa',
  'аль-бусайтин': 'al busaiteen',
  'аль-хала мухаррак': 'al hala',
  'иса таун': 'isa town',

  // Чехия
  'спарта колин': 'sparta kolin',
  'горни ржедице': 'horni redice',
  'блэкберн роверс': 'blackburn',
  'шеффилд уэнздей': 'sheffield wednesday',
  'кру александра': 'crewe',
  'бристоль роверс': 'bristol rovers',
  'уолсолл': 'walsall',
  'крэй вэлли папер милс': 'cray valley paper mills',
  'уэллинг юнайтед': 'welling united',
  'далвич хэмлет': 'dulwich hamlet',
  'уайтхок': 'whitehawk',
  'канви айленд': 'canvey island',
  'чичестер сити': 'chichester city',
  'файлд': 'fylde',
  'питерборо спортс': 'peterborough sports',
  'рэдклифф': 'radcliffe',
  'оксфорд сити': 'oxford city',
  'фарнборо': 'farnborough',
  'челмсфорд сити': 'chelmsford city',
  'дувр атлетик': 'dover athletic',
  'торки юнайтед': 'torquay united',
  'чешем юнайтед': 'chesham united',
  'тоттон': 'totton',
  'мейденхед юн': 'maidenhead united',
  'бат сити': 'bath city',
  'энфилд таун': 'enfield town',
  'хэмптон энд ричмонд боро': 'hampton and richmond',
  'уэстон см': 'weston super mare',
  'уэртинг': 'worthing',
  'борн таун': 'bourne town',
  'саттон колдфилд таун': 'sutton coldfield town',
  'лафборо юниверсити': 'loughborough university',
  'коулшил таун': 'coleshill town',
  'ашингтон': 'ashington',
  'консетт': 'consett',
  'ансти номэдс': 'anstey nomads',
  'лонг-итон юнайтед': 'long eaton united',
  'ранкорн линнетс': 'runcorn linnets',
  'чейстаун': 'chasetown',
  'данстон': 'dunston',
  'ньютон айклиф': 'newton aycliffe',
  'уоррингтон райлендс': 'warrington rylands',
  'рашолл олимпик': 'rushall olympic',
  'гайзли': 'guiseley',
  'бамбер-бридж': 'bamber bridge',
  'клиторпс таун': 'cleethorpes town',
  'уоррингтон таун': 'warrington town',
  'фалмут таун': 'falmouth town',
  'шефтсбери': 'shaftesbury',
  'ле ман': 'le mans',
  'ботошани': 'botosani',
  'оцелул галац': 'otelul galati',
  'оцелул': 'otelul',
  'германштадт сибиу': 'hermannstadt',
  'германштадт': 'hermannstadt',
  'рапид бухарест': 'rapid',
  'маастрихт': 'mvv maastricht',
  'алмере сити': 'almere city',
  'расинг авельянеда': 'racing club',
  'дефенса': 'defensa y justicia',
  'эстудиантес ла-плата': 'estudiantes',
  'химнасия и эсгрима мендоса': 'gimnasia mendoza',
  'колон санта-фе': 'colon de santa fe',
  'гуарани асунсьон': 'guarani',
  'олимпия асунсьон': 'olimpia asuncion',
  'рубио нью': 'rubio nu',
  'спортиво триниденси': 'sportivo trinidense',
  'спортиво лукеньо': 'sportivo luqueno',
  'б-б термалица': 'nieciecza',
  'термалица': 'bruk-bet termalica',
  'краковия краков': 'cracovia',
  'эвертон вм': 'everton de vina',
  'унион ла калера': 'union la calera',
  "о'хиггинс": "ohiggins",
  'депортес консепсьон': 'deportes concepcion',
  'таршин рэйнбоуз': 'tarxien rainbows',
  'таршин': 'tarxien',
  'хапоэль рамат-ган': 'hapoel ramat gan',
  'хапоэль раанана': 'hapoel raanana',
  'интернасьонал де богота': 'internacional bogota',
  'депортес толима': 'deportes tolima',
  'депортиво перейра': 'deportivo pereira',
  'хуниор барранкилья': 'junior barranquilla',
  'реал сантандер': 'real santander',
  'атлетико кали': 'atletico cali',
  'рио-бранко акри': 'rio branco ac',
  'мадурейра рж': 'madureira',
  'васко да гама рж': 'vasco da gama',
  'фигейренсе': 'figueirense',
  'ферровиарио форталеза': 'ferroviario',
  'оувидоренси': 'ouvidence',
  'анаполина': 'anapolina',
  'апаресиденсе': 'aparecidense',
  'комерсьентес унидос': 'comerciantes unidos',
  'депортиво мокегуа': 'deportivo moquegua',
  'аль-адалх': 'al-adalh',
  'аль-тай': 'al-tai',
  'аль-иттифак': 'al-ittifaq',
  'аль-таавон бурайда': 'al-taawoun',
  'аль-таавон': 'al-taawoun',
  'аль-халедж сайхат': 'al-khaleej',
  'аль-халедж': 'al-khaleej',
  'аль-кадисия эль-хубар': 'al-qadsiah',
  'аль-кадисия': 'al-qadsiah',
  'джидда': 'jeddah fc',
  'аль-джабалайн': 'al-jabalain',
  'каррик рейнджерс': 'carrick rangers',
  'портадаун': 'portadown',
  'лофголл': 'loughgall',
  'нокбреда': 'knockbreda',
  'бонесс юнайтед': 'boness united',
  'транент джуниор': 'tranent juniors',
  'ноджом маср': 'nogoom el mostakbal',
  'каскада': 'cascade fc',
  'аль пешмерга': 'al peshmerga',
  'нафт аль-васат': 'naft al-wasat',
  'валлидаан дакар': 'wallidan dakar',
  'гедиавей': 'guediawaye',
  'лерума юнайтед': 'leruma united',
  'джомо космос': 'jomo cosmos',
  'кармелита': 'carmelita',
  'хикараль': 'jicaral',
  'агилас уагро': 'aguilas uagro',
  'спортинг канами': 'sporting canamy',

  // ==================== ДОПОЛНИТЕЛЬНЫЕ МАППИНГИ ====================
  // Альтернативные написания
  'кристал пелас': 'crystal palace',
  'хольштайн киль': 'holstein kiel',
  'хольштейн киль': 'holstein kiel',
  'аз алкмаар': 'az alkmaar',
  'гройтер фюрт': 'greuther furth',
  'дармштадт': 'darmstadt',
  'дармштадт 98': 'darmstadt',
  'витория гимараеш': 'vitoria',
  'витория': 'vitoria',
  'белград': 'crvena zvezda',
  'мидтьюлланн': 'midtjylland',
  'мидтъюлланд': 'midtjylland',
  
  // Турция - дополнительные
  'кечиоренгючю': 'keciorenguku',
  'бандирмаспор': 'bandirmaspor',
  'истанбулспор': 'istanbulspor',
  'маниса': 'manisa',
  'болуспор': 'boluspor',
  'гезтепе': 'goztepe',
  'анталияспор': 'antalyaspor',
  'пендикспор': 'pendikspor',
  
  // Австрия
  'грацер': 'grazer ak',
  'альтах': 'altach',
  'рид': 'ried',
  'блау-вайсс линц': 'fc bw linz',
  
  // Нидерланды - дополнительные
  'гоу-эхед иглз': 'go ahead eagles',
  'камбюр': 'cambuur',
  'нек': 'nec',
  'нек неймеген': 'nec',
  'вилем ii': 'willem ii',
  'эммен': 'emmen',
  'рода': 'roda',
  'де граафсхап': 'de graafschap',
  'вааль': 'waalwijk',
  'вааль вейк': 'waalwijk',
  'ден хааг': 'ado den haag',
  'хераклес': 'heracles',
  'хераклес альмело': 'heracles almelo',
  
  // Кипр
  'апоэль': 'apoel nicosia',
  'апоэль никосия': 'apoel nicosia',
  'аел лимассол': 'ael limassol',
  'аполлон лимассол': 'apollon limassol',
  'омония': 'omonia nicosia',
  'омония никосия': 'omonia nicosia',
  'аек ларнака': 'aek larnaca',
  'пафос': 'pafos',
  
  // Словения
  'марибор': 'maribor',
  'олимпия любляна': 'olimpija ljubljana',
  'целье': 'celje',
  'копер': 'koper',
  'мура': 'mura',
  'алюминий': 'aluminij',
  'браво': 'bravo',
  'домжале': 'domzale',
  
  // Германия - дополнительные 2. Бундеслига
  'хольштайн': 'holstein kiel',
  'гамбургер': 'hamburger sv',
  'ганза росток': 'hansa rostock',
  'ганза': 'hansa rostock',
  'эрцгебирге ауэ': 'erzgebirge aue',
  'ауэ': 'erzgebirge aue',
  'дуйсбург': 'duisburg',
  'брауншвейг': 'eintracht braunschweig',
  'арминия': 'arminia bielefeld',
  
  // Франция - дополнительные
  'бордо': 'bordeaux',
  'клермон': 'clermont',
  'клермон фут': 'clermont foot',
  'аяччо': 'ajaccio',
  'бастия': 'bastia',
  'гавр': 'le havre',
  
  // Россия
  'зенит санкт-петербург': 'zenit',
  
  // Украина
  'шахтер донецк': 'shakhtar donetsk',
  
  // Швейцария
  'серветт': 'servette',
  'лозанна': 'lausanne',
  
  // Дания
  'оденсе': 'odense',
  'вайле': 'vejle',
  'люнгбю': 'lyngby',
  
  // Бельгия
  'эйпен': 'eupen',
  'лёвен': 'leuven',
  'ваасланд': 'waasland-beveren',
  
  // Хорватия
  'локомотива загреб': 'lokomotiva zagreb',
  'истра': 'istra 1961',
  
  // Сербия
  'красная звезда': 'crvena zvezda',
  
  // Греция
  
  // Шотландия
  
  // Португалия - дополнительные
  'маритиму': 'maritimo',
  'санта-клара': 'santa clara',
  'фамаликао': 'famalicao',
  'каша пия': 'casa pia',
  'арока': 'arouca',
  'эштрела': 'estrela amadora',
  'морейренше': 'moreirense',
  'шавеш': 'chaves',
  
  // Чехия - дополнительные
  'яблонец': 'jablonec',
  'словацко': 'slovacko',
  
  // Польша - дополнительные  
  'вислa краков': 'wisla krakow',
  'загленбе': 'zaglebie lubin',
  'шленск': 'slask wroclaw',
  'шлёнск вроцлав': 'slask wroclaw',
  'пяст': 'piast gliwice',
  'сталь': 'stal mielec',
  'варта познань': 'warta poznan',
  
  // Венгрия
  'ференцварош': 'ferencvaros',
  'будапешт гонвед': 'budapest honved',
  'фехервар': 'fehervar',
  'пакш': 'paksi',
  'уйпешт': 'ujpest',
  'кечкемет': 'kecskemet',
  'дебрецен': 'debrecen',
  'зрини': 'zrinjevac',
  // === ДОПОЛНИТЕЛЬНЫЕ МАППИНГИ (auto-added 2026-02-08) ===
  // Аргентина
  'тигре': 'tigre',
  'расинг авельянеда': 'racing club',
  'расинг клуб': 'racing club',
  'дефенса и хустисия': 'defensa y justicia',
  'дефенса': 'defensa y justicia',
  'эстудиантес ла-плата': 'estudiantes l.p.',
  'эстудиантес': 'estudiantes l.p.',
  // Израиль
  'кфар-касем': 'kafr qasim',
  'кфар касем': 'kafr qasim',
  'хапоэль рамат-ган': 'hapoel ramat gan',
  'хапоэль раанана': 'hapoel raanana',
  // Парагвай
  'серро портеньо': 'cerro porteno',
  'спортиво лукеньо': 'sportivo luqueno',
  'либертад асунсьон': 'libertad asuncion',
  'депортиво реколета': 'deportivo recoleta',
  'реколета': 'recoleta',
  // Нидерланды
  'йонг псв эйндховен': 'jong psv',
  'йонг псв': 'jong psv',
  'камбур': 'cambuur',
  // ОАЭ
  'банияс': 'baniyas sc',
  'аль-джазира абу-даби': 'al-jazira',
  'аль-джазира': 'al-jazira',
  // Саудовская Аравия
  'аль-иттифак': 'al-ettifaq',
  'аль-таавон бурайда': 'al taawon',
  'аль-таавон': 'al taawon',
  'аль-халедж сайхат': 'al khaleej saihat',
  'аль-халедж': 'al khaleej saihat',
  'аль-кадисия эль-хубар': 'al qadisiya',
  'аль-кадисия': 'al qadisiya',
  'аль-адалх': 'al-adalah',
  'аль-тай': 'al taee',
  // Колумбия
  'интернасьонал де богота': 'internacional de bogota',
  'депортес толима': 'deportes tolima',
  'депортиво перейра': 'deportivo pereira',
  'хуниор барранкилья': 'junior',
  'хуниор': 'junior',
  // Чили
  'эвертон вм': 'everton de vina',
  'унион ла калера': 'union la calera',
  'депортес консепсьон': 'universidad de concepcion',
  'о\'хиггинс': 'ohiggins',
  'охиггинс': 'ohiggins',
  // Бразилия
  'мадурейра рж': 'madureira',
  'васко да гама рж': 'vasco da gama',
  // Польша
  'б-б термалица': 'nieciecza',
  'краковия краков': 'cracovia krakow',
  'краковия': 'cracovia krakow',
  // Колумбия - серия В
  'реал сантандер': 'real santander',
  'атлетико кали': 'atletico fc',
  // === ДОПОЛНИТЕЛЬНЫЕ МАППИНГИ 2 (auto-added 2026-02-08) ===
  // Англия - lower leagues
  'уиган': 'wigan',
  'уиган атлетик': 'wigan athletic',
  'эшингтон': 'ashington afc',
  'реал бедфорд': 'real bedford',
  'харборо таун': 'harborough town',
  'порт вейл': 'port vale',
  'афк уимблдон': 'afc wimbledon',
  'энфилд': 'enfield town',
  'хэмптон энд ричмонд боро': 'hampton and richmond',
  'крэй вэлли': 'cray valley',
  'лонг-итон юнайтед': 'long eaton united',
  'ансти номэдс': 'anstey nomads',
  'ньютон айклиф': 'newton aycliffe',
  'бонесс юнайтед': 'bo ness united',
  'транент джуниор': 'tranent juniors',
  // Англия - reserves (р)
  'болтон (р)': 'bolton',
  'оксфорд юнайтед (р)': 'oxford united',
  'мэнсфилд таун (р)': 'mansfield town',
  'дерби каунти (р)': 'derby county',
  'ноттс каунти (р)': 'notts county',
  'престон норт энд (р)': 'preston',
  'колрейн (р)': 'coleraine',
  'крузейдерс (р)': 'crusaders',
  'портадаун (р)': 'portadown',
  'линфилд (р)': 'linfield',
  'каррик рейнджерс (р)': 'carrick rangers',
  'баллимина юнайтед (р)': 'ballymena united',
  'клифтонвилл (р)': 'cliftonville',
  'бангор (р)': 'bangor',
  // Бразилия
  'атлетико карлос рено': 'carlos renaux',
  'xv де новембру пирасикаба': 'xv novembro',
  // Перу
  'депортиво мокегуа': 'ucv moquegua',
  // Коста-Рика
  'интер сан-карлос': 'inter san carlos',
  'пфа антьокия': 'pfa antioquia',
  // Таиланд
  'сисакет юнайтед': 'sisaket united',
  // Колумбия
  'реал сантандер': 'real santander',
  // МК Оран / Алжир
  'мк оран': 'mc oran',
  'уэд акбу': 'olympique akbou',
  // ЮАР
  'джомо космос': 'jomo cosmos',
  'лерума юнайтед': 'leruma united',
  // Саудовская Аравия
  'аль-шабаб эр-рияд': 'al-shabab',
  'аль-ахли джидда': 'al-ahli jeddah',
  'аль-рияд': 'al riyadh',
  'аль-наср эр-рияд': 'al-nassr',
  'дамак': 'damac',
  'аль-фейха': 'al-feiha',
  'аль-фатех': 'al-fateh',
  'аль-хулуд': 'al-khulood',
  'аль-хазм': 'al-hazem',
  'аль-джабалайн': 'al-jbalain',
  // === ДОПОЛНИТЕЛЬНЫЕ МАППИНГИ 3 (auto-added 2026-02-09 - fix unmatched) ===
  // Нидерланды
  'валвейк': 'waalwijk',
  'валвайк': 'waalwijk',
  // Польша
  'рух хожув': 'ruch chorzow',
  'хожув': 'ruch chorzow',
  // Австрия
  'вольфсберг': 'wolfsberger ac',
  'гак': 'grazer ak',
  // Сербия
  'войводина нови сад': 'vojvodina',
  'младост лучани': 'mladost lucani',
  // Колумбия
  'хагуарес кордоба': 'jaguares',
  'хагуарес': 'jaguares',
  'депортиво перейра': 'deportivo pereira',
  'атлетико кали': 'atletico fc cali',
  'интернасиональ пальмира': 'internacional palmira',
  // Испания - доп
  'химнастик таррагона': 'gimnastic',
  'химнастик': 'gimnastic',
  'альмерия 2': 'almeria ii',
  'альмерия ii': 'almeria ii',
  'малага ii': 'malaga ii',
  'лас-пальмас ii': 'las palmas ii',
  'малага 2': 'malaga ii',
  'эстремадура': 'extremadura 1924',
  'атлетико антониано': 'antoniano',
  'субиса': 'subiza',
  'ад сан хуан': 'san juan',
  'ad сан хуан': 'san juan',
  'сан хуан': 'san juan',
  'райо кантабрия': 'rayo cantabria',
  'самано': 'samano',
  'лас-пальмас 2': 'las palmas ii',
  'депортиво кория': 'cd coria',
  'парла': 'ad parla',
  // Италия - доп
  'джулианова': 'real giulianova',
  'саммаурезе': 'sammaurese',
  'бьеллезе': 'biellese',
  'читта-ди-варезе': 'citta di varese',
  'атлетик палермо': 'ac palermo',
  'милаццо': 'milazzo',
  'фьорентино': 'fiorentino',
  // Сан-Марино
  'фольгоре/фальчано': 'folgore',
  'фольгоре': 'folgore falciano',
  // Бразилия - доп
  'франкана': 'francana',
  'унио сузано': 'usac',
  'жакареи': 'jacarei',
  'интер бебедоуро': 'inter de bebedouro',
  'интернасьонал рс': 'internacional',
  'сан луис ижуи': 'sao luiz',
  'куяба': 'cuiaba',
  'амазонас': 'amazonas',
  'насьонал манаус': 'nacional am',
  'авенида': 'avenida',
  'гуарани баже': 'guarani bage',
  'монсоон': 'monsoon',
  'блуминг санта крус': 'blooming',
  'ориенте петролеро': 'oriente petrolero',
  'атлетика гуарани': 'guarany se',
  'деспортива аракажу': 'desportiva aracaju',
  // Турция - доп
  'шанлыурфаспор': 'sanliurfaspor',
  'искендерун фк': 'iskenderunspor',
  'бейкоз анадолу': 'beykoz anadolu',
  'буджаспор': 'bucaspor',
  'арнавуткей': 'arnavutkoy belediyespor',
  'гюзиде гебзеспор': 'belediye derincespor',
  // Португалия - доп
  'лаженси': 'lajense',
  'илектрику': 'electrico',
  // Косово
  'гиляни': 'gjilani',
  'кф балкани': 'ballkani',
  // Сингапур
  'янг лайонс': 'young lions',
  'лайон сити сейлорс': 'lion city sailors',
  // Бельгия
  'абе ла нев': 'habay-la-neuve',
  'юнион намюр': 'union namur',
  // Руанда
  'муханга': 'muhanga',
  'гесоджи юнайтед': 'gasogi united',
  // Иордания
  'аль-бакаа': 'al buqaa',
  'аль-рамтха': 'al ramtha',
  // Перу
  'сьенсьяно': 'cienciano',
  'хуан пабло 2': 'juan pablo ii college',
  // Малайзия
  'перак': 'perak',
  'джохор дарул такзим 2': 'jdt ii',
  'селангор 2': 'selangor ii',
  'кедах': 'kedah',
  // Мексика
  'койотес де тласкала': 'tlaxcala',
  'универсидад гвадалахара': 'leones negros udg',
  // Ямайка  
  'данбихолден': 'dunbeholden',
  'уотерхаус': 'waterhouse',
  'харбор вью': 'harbour view',
  'портмор юнайтед': 'portmore united',
  // Египет
  'аль-олимпи': 'al olympi',
  'тамеа': 'tameea',
  'эль-аламейн': 'el alamein',
  'эль-минья': 'el minya',
  'аль-наср тааден': 'al nasr taaden',
  'файюм': 'fayoum',
  // === ДОПОЛНИТЕЛЬНЫЕ МАППИНГИ 5 (auto-added 2026-02-09 - deep search fixes) ===
  // Колумбия - fix Atletico Cali -> Depor FC (renamed)
  'атлетико кали': 'depor fc',
  // Сенегал
  'тенгет': 'teungueth',
  'дакар сакре-кер': 'dsc',
  // Нидерланды женщины
  'твенте': 'twente',
  'алкмар': 'az',
  // Испания - доп 2
  'сьелло': 'ciello',
  'вильяверде': 'villaverde',
  'мартиненк': 'martinenc',
  'фуэнлабрада 2': 'fuenlabrada ii',
  'интер вальдеморо': 'inter valdemoro',
  'итурригорри': 'iturrigorri',
  'сд сан-педро': 'sd san pedro',
  'редован': 'redovan',
  'олимпик хатива': 'olimpic xativa',
  'ольерия': 'olleria',
  'бениганим': 'beniganim',
  'эльмантико': 'helmantico',
  'бенавенте': 'benavente',
  'уд сан-мауро': 'ud san mauro',
  'сиудад кооператива': 'ciudad cooperativa',
  'амуррио': 'amurrio',
  'культураль абетуксуко': 'cultural abetxuko',
  'лас-росас 2': 'las rozas ii',
  'дагансо': 'daganzo',
  'бенидорм': 'benidorm',
  'хавеа': 'javea',
  'райо ибенсе': 'rayo ibense',
  'мучамель': 'mutxamel',
  'алертанавия': 'alertanavia',
  'сентед академи': 'sented academy',
  'бадахос 2': 'badajoz ii',
  'уп барбано': 'up barbano',
  'умия': 'umia',
  'понтеведра 2': 'pontevedra ii',
  'пуэртольяно': 'puertollano',
  'ильескас': 'illescas',
  'гран пенья': 'gran pena',
  'монтаньерос': 'montaneros',
  'луго 2': 'lugo ii',
  'ароса': 'arosa',
  // Италия - доп 2
  'галатин': 'galatina',
  'битонто': 'bitonto',
  'кортичелла': 'corticella',
  'сальсомаджоре': 'salsomaggiore',
  'академи трапани': 'accademia trapani',
  'ликата': 'licata',
  'полиспортива феррини кальяри': 'polisportiva ferrini cagliari',
  'ильвамаддалена': 'ilvamaddalena',
  'портичи': 'portici',
  'путеолана 1902': 'puteolana 1902',
  'тиволи': 'tivoli',
  'стерпаро': 'sterparo',
  'арче 1932': 'arce 1932',
  // Ирландия
  'бангор селтик': 'bangor celtic',
  'вэйсайд селтик': 'wayside celtic',
  // Андорра
  'фк санта-колома 2': 'fc santa coloma ii',
  'каса-де-португал': 'casa de portugal',
  // Гватемала
  'депортиво истапа': 'deportivo iztapa',
  'санта лусия коцумальгуапа': 'santa lucia cotzumalguapa',
  'депортиво коатепеке': 'deportivo coatepeque',
  'депортиво сан-педро': 'deportivo san pedro',
  'депортиво ипала': 'deportivo ipala',
  'депортиво карча': 'deportivo carcha',
  'депортиво аютла': 'deportivo ayutla',
  'депортиво чиантла': 'deportivo chiantla',
  'депортиво сан-себастьян': 'deportivo san sebastian',
  'депортиво такана': 'deportivo tacana',
  'драко': 'draco',
  'чампс академи': 'champs academy',
  'киче': 'quiche',
  // Гондурас
  'олимпия ла энтрада': 'olimpia la entrada',
  'сан-хуан хуракан': 'san juan huracan',
  'санта роса ла-масика': 'santa rosa la masica',
  // Гонконг
  'тунг-синг': 'tung sing',
  'суприм': 'supreme',
  'шатин': 'sha tin',
  'саут чайна': 'south china',
  'сентрал-вестерн': 'central western',
  'вофу се': 'wofu se',
  'шам шуй по': 'sham shui po',
  'ситизен': 'citizen',
  'туэнь мун са': 'tuen mun sa',
  'фукиен': 'fukien',
  'вонг тай син': 'wong tai sin',
  'фу мунь': 'fu moon',
  'айлендс': 'islands',
  'сити линкерс': 'city linkers',
  // Бахрейн
  'аль-иттифак макаба': 'al ittifaq',
  'бури': 'budaiya',
  'ист риффа': 'east riffa',
  'аль-бусайтин': 'al busaiteen',
  'аль-хала мухаррак': 'al hala',
  'иса таун': 'isa town',
  'умм аль-хассам': 'umm al hassam',
  'манама': 'manama',
  'аль-тадамун бури': 'al tadamun',
  'этихад аль-риф': 'ettihad al rif',
  'калали': 'galali',
  // Камерун
  'фов азур элит': 'fovu azur elite',
  'баменда': 'bamenda',
  // Сент-Китс и Невис
  'сэнди пойнт': 'sandy point',
  'хонда ньютаун юнайтед': 'honda newtown united',
  'фк сент-питерс': 'fc st peters',
  'виллэйдж суперстарз': 'village superstars',
  // Суринам
  'форвартс': 'voorwaarts',
  'интер мунготапу': 'inter moengotapoe',
  // Австралия
  'балкатта': 'balcatta',
  'олимпик кингсувэй': 'olympic kingsway',
  'перт ред стар': 'perth red star',
  'фримантл сити': 'fremantle city',
  'флорит афина': 'floreat athena',
  'балга': 'balga',
  'сабиако': 'subiaco',
  'норт бич': 'north beach',
  'макартур рэмс': 'macarthur rams',
  'вестерн сити рейнджерс': 'western city wanderers',
  // Замбия
  'чипата сити каунсил': 'chipata city council',
  'тридент': 'trident',
  'чирунду юнайтед': 'chirundu united',
  'мпулунгу харбор': 'mpulungu harbour',
  // Гамбия
  'норт стар академи': 'north star academy',
  'юник глобал': 'unique global',
  'серрекунда': 'serrekunda',
  'банжул юнайтед': 'banjul united',
  'гамбия армед форсес': 'gambia armed forces',
  'уоллидан': 'wallidan',
  // Аргентина региональная
  'ла амистад': 'la amistad',
  'атлетико боксинг': 'atletico boxing',
  'эскобар': 'escobar',
  'колон чивилькой': 'colon chivilcoy',
  'сентраль архентино': 'central argentino',
  'хенераль пас хуниорс': 'general paz juniors',
  'ферро хенераль пико': 'ferro general pico',
  'расинг олаваррия': 'racing olavarria',
  'бен ур': 'ben hur',
  'хувентуд унида гуалегуайчу': 'juventud unida gualeguaychu',
  // Эквадор (товарищеские)
  'депортиво аукас': 'aucas',
  'текнико университарио': 'tecnico universitario',
  // Молдова (товарищеские) 
  'шериф 2 тирасполь': 'sheriff ii',
  'зимбру 2': 'zimbru ii',

  // === ДОПОЛНИТЕЛЬНЫЕ МАППИНГИ 6 (auto-added 2026-02-10 - fix DB name matching) ===
  // Словакия
  'жилина': 'zilina',
  'комарно': 'komarno',
  // Португалия
  'насьонал мадейра': 'nacional',
  'насьонал': 'nacional',
  'каса пия': 'casa pia',
  'машику': 'machico',
  'шавиш': 'chaves',
  'шавиш 2': 'chaves',
  'гондомар': 'gondomar',
  // Италия  
  'прато': 'prato',
  'поджибонси': 'poggibonsi',
  'роккасекка т. сан-томмазо': 'rokkasekka',
  // Бельгия
  'сент-трейден': 'sint truiden',
  'сент-трейден 2': 'sint truiden',
  'берхем': 'berchem sport',
  'серкль брюгге': 'cercle brugge',
  'серкль брюгге 2': 'cercle brugge',
  'розеларе': 'roeselare daisel',
  // Нидерланды
  'вв уна': 'una',
  'розендал': 'roosendaal',
  // Испания — исправленные маппинги для точного совпадения с БД
  'херес депортиво': 'xerez deportivo',
  'реал хаэн': 'real jaen',
  'пуэртольяно': 'puertollano',
  'райо кантабрия': 'racing santander',
  'самано': 'samano',
  'сьелло': 'ciello',
  'парла': 'ad parla',
  'лас-росас 2': 'las rozas',
  'дагансо': 'daganzo',
  'луго 2': 'lugo',
  'ароса': 'arosa',
  'вильяверде': 'villaverde',
  
  'бадахос 2': 'badajoz',
  'уп барбано': 'up barbano',
  'умия': 'umia',
  'понтеведра 2': 'pontevedra',
  'гран пенья': 'gran pena',
  'монтаньерос': 'montaneros',
  // Испания — женские
  'гранадилья тенерифе': 'granad tenerife',
  'алама': 'alhama',
  'гранада 2': 'granada',
  'хуан гранде': 'juan grande',
  'атлетик бильбао 2': 'athletic bilbao',
  'реал сосьедад 2': 'real sociedad',
  'бургос кф': 'burgos cf',
  'реал авилес': 'real aviles',
  'валенсия': 'valencia',
  'овьедо модерно': 'oviedo moderno',
  'фундасьон альбасете': 'fundacion albacete',
  'касереньо': 'cacereno',
  'европа': 'europa',
  'тенерифе сюр 2': 'tenerife sur',
  // Бразилия
  'жакареи': 'jacarei',
  'интер бебедоуро': 'inter de bebedouro',
  'ботафого рж': 'botafogo',
  'монсоон': 'monsoon',
  'интернасьонал санта-мария': 'internacional sm',
  'авенида': 'avenida',
  'гуарани баже': 'guarani',
  'куяба': 'cuiaba',
  'варзеа-гранди': 'varzea grande',
  'фламенго рж': 'flamengo',
  'васко да гама': 'vasco da gama',
  // Шотландия женщины
  'хиберниан': 'hibernian',
  'мотеруэлл': 'motherwell',
  'гамильтон академикал': 'hamilton academical',
  'рейнджерс': 'rangers',
  'хартс': 'hearts',
  'абердин': 'aberdeen',
  'глазго сити': 'glasgow city',
  'селтик': 'celtic',
  'монтроуз': 'montrose',
  'партик тисл': 'partick thistle',
  'ист файф': 'east fife',
  'данди юнайтед': 'dundee united',
  'сент-джонстон': 'st johnstone',
  'ливингстон': 'livingston',
  'стерлинг юниверсити': 'stirling university',
  'куинз парк лфк': 'queens park',
  // Греция женщины
  'паок': 'paok',
  'волос 2004': 'volos',
  'трикала 2011': 'trikala 2011',
  'кифисиас': 'kifisias',
  'астерас триполис': 'asteras tripolis',
  // Турция женщины
  'фенербахче': 'fenerbahce',
  'бешикташ': 'besiktas',
  'галатасарай': 'galatasaray',
  'чекмекой бильгидога': 'cekmekoy bilgidoga',
  'фатих ватанспор': 'fatih vatanspor',
  'юксекова беледиеспор': 'yuksekova belediyespor',
  '1207 антальяспор': '1207 antalyaspor',
  'фомгет генчлик': 'fomget genclik',
  'бакиркой кадин': 'bakirkoy kadin',
  'хаймана спор': 'haymana spor',
  // Англия женщины
  'халл сити': 'hull city',
  'сток сити': 'stoke city',
  'вулверхэмптон': 'wolverhampton',
  'дерби каунти': 'derby county',
  'мидлсбро': 'middlesbrough',
  'бернли': 'burnley',
  'норвич сити': 'norwich city',
  'фулхэм': 'fulham',
  'лидс юнайтед': 'leeds united',
  'барнсли': 'barnsley',
  'стокпорт каунти': 'stockport county',
  'эксетер сити': 'exeter city',
  'плимут аргайл': 'plymouth argyle',
  'питерборо юнайтед': 'peterborough united',
  'кембридж юнайтед': 'cambridge united',
  // Франция женщины D2
  'мец': 'metz',
  'родез': 'rodez',
  'осер': 'auxerre',
  'тулуза': 'toulouse',
  'ле ман': 'le mans',
  'сен-мало': 'saint malo',
  'ницца': 'nice',
  'генгам': 'guingamp',
  'лилль': 'lille',
  'тонон эвиан': 'thonon evian',
  // Франция — доп. клубы (U19, D2, etc.)
  'дижон': 'dijon',
  'коломье': 'colomiers',
  'крей': 'creteil',
  'бобиньи-баньоле-ганьи': 'bobigny bagnolet gagny',
  'монфермей': 'montfermeil',
  'сен-прист': 'saint priest',
  'бокузе': 'boucau',
  'верту': 'vertou',
  'валансьен': 'valenciennes',
  'амьен': 'amiens',
  'шильтигейм': 'schiltigheim',
  'сарсель': 'sarcelles',
  'кан': 'caen',
  'расинг париж': 'racing paris',
  'шартр': 'chartres',
  'кевийи': 'quevilly',
  'кавигаль ницца': 'cavigal nice',
  'стад ренн': 'stade rennais',
  'нант': 'nantes',
  'бордо': 'bordeaux',
  // Гонконг
  'ли ман': 'lee man',
  'коулун сити': 'kowloon city',
  'шам шуй по': 'sham shui po',
  'ситизен': 'citizen aa',
  'тунг-синг': 'tung sing',
  'суприм': 'supreme',
  'шатин': 'sha tin',
  'саут чайна': 'south china',
  'сентрал-вестерн': 'central western',
  'вофу се': 'wofu se',
  'вонг тай син': 'wong tai sin',
  'фу мунь': 'fu moon',
  'туэнь мун са': 'tuen mun sa',
  'фукиен': 'fukien',
  'айлендс': 'islands',
  'сити линкерс': 'city linkers',
  // Греция (U19 + женщины)
  'илиуполи': 'ilioupoli',
  'эгалео': 'egaleo',
  'паниониос': 'panionios',
  'эллас сирос': 'ellas syros',
  'по триглия/ираклис': 'iraklis',
  'пас янина': 'pas giannina',
  'ретимнякис эносос': 'rethymniakis',
  // Испания (U19 + региональные) — доп.
  'эспаньол': 'espanyol',
  'барселона': 'barcelona',
  'мальорка': 'mallorca',
  'эльче': 'elche',
  'расинг сантандер': 'racing santander',
  'расинг ферроль': 'racing ferrol',
  'хетафе': 'getafe',
  'вальядолид': 'valladolid',
  'кастельон': 'castellon',
  'хове эспаньол': 'jove espanyol',
  'эйбар': 'eibar',
  'мурсия': 'murcia',
  'патакона': 'patacona',
  'тривал вальдерас': 'trival valderas',
  'ла крус вильяновенсе': 'villanovense',
  'севилья': 'sevilla',
  'сан феликс': 'san felix',
  'атлетико мадрид': 'atletico madrid',
  'унионистас саламанка': 'unionistas de salamanca',
  'оберена': 'oberena',
  'валь минор': 'val minor',
  'лейоа': 'leioa',
  'алавес': 'alaves',
  'укам мурсия': 'ucam murcia',
  'талавера': 'cf talavera',
  'депортиво ла-корунья': 'deportivo la coruna',
  'химнастика торрелавега': 'gimnastica torrelavega',
  'вильярреал': 'villarreal',
  'пинатар': 'pinatar',
  'олимпик хатива': 'olimpic xativa',
  'сабадель 2': 'sabadell',
  'сантфелиуэнк': 'santfeliuenc',
  'бенидорм': 'benidorm',
  'хавеа': 'javea',
  'интер вальдеморо': 'inter valdemoro',
  'амуррио': 'amurrio',
  // Испания женщины — доп.
  'саламанка': 'salamanca',
  'лас-розас': 'las rozas',
  'реал сарагоса': 'real zaragoza',
  'европа 2': 'europa',
  'барселона 3': 'barcelona',
  // Италия (региональная + D)
  'портичи': 'portici',
  'путеолана 1902': 'puteolana 1902',
  'кортичелла': 'corticella',
  'сальсомаджоре': 'salsomaggiore',
  'тиволи': 'tivoli',
  'ликата': 'licata',
  'галатин': 'galatina',
  'битонто': 'bitonto',
  'кьети': 'chieti',
  'сан николо': 'san nicolo notaresco',
  'лумеццане': 'lumezzane',
  'сан-марино академия': 'san marino academy',
  // Малайзия
  'перак': 'perak',
  'джохор дарул такзим 2': 'johor darul takzim',
  'джохор дарул такзим': 'johor darul takzim',
  'селангор 2': 'selangor',
  'кедах': 'kedah',
  // Египет
  'эль-аламейн': 'el alamein',
  'эль-минья': 'el minya',
  'аль-наср тааден': 'al nasr',
  'аль-олимпи': 'al olympic',
  // Кипр женщины
  'омония никосия': 'omonia nicosia',
  'аполлон лимасол': 'apollon limassol',
  // Израиль женщины
  'рамат-ха-шарон': 'ramat hasharon',
  'пантерс ашдод': 'panthers ashdod',
  // Чехия женщины
  'теплице': 'teplice',
  'словацко': 'slovacko',
  // Балтия женщины
  'флора таллин': 'flora tallinn',
  'ригас фш': 'rigas fs',
  // Северная Ирландия резерв
  'гленавон': 'glenavon',
  'каррик рейнджерс': 'carrick rangers',
  'линфилд': 'linfield',
  'клифтонвилл': 'cliftonville',
  'бангор': 'bangor',
  'гленторан': 'glentoran',
  // Индонезия
  'арема': 'arema',
  'бхаянгкара': 'bhayangkara',
  'псм макассар': 'psm makassar',
  'персия джакарта': 'persija',
  'псбс биак': 'psbs biak numfor',
  'малут юнайтед': 'malut united',
  'деджан': 'dejan',
  'ранс нусантара': 'rans nusantara',
  // Саудовская Аравия U21
  'аль-хазм': 'al hazm',
  'аль-фатех': 'al fateh',
  'аль-хулуд': 'al kholood',
  'аль-джабалайн': 'al jabalain',
  'аль-оруба': 'al oruba',
  'аль-шабаб эр-рияд': 'al shabab',
  'аль-ахли джидда': 'al ahli',
  'аль-раед бурайда': 'al raed',
  'аль-иттихад джидда': 'al ittihad',
  'дамак': 'damac',
  'аль-адалх': 'al adalah',
  'аль-халедж сайхат': 'al khaleej',
  // Вьетнам
  'пвф-канд 2': 'pvf cand',
  'чыонг туой донг най': 'truong tuoi dong nai'
};

/**
 * Применяет прямой маппинг названия команды
 */
function applyTeamMapping(name) {
  if (!name) return name;
  const lower = name.toLowerCase().trim();
  return teamNameMappings[lower] || name;
}

/**
 * Кэш команд из БД - загружается при старте
 */
let teamsCache = new Map(); // id -> {name, normalized, keywords, trigrams}
let teamsIndex = new Map(); // keyword -> Set<teamId>
let trigramIndex = new Map(); // trigram -> Set<teamId>
let cacheLoaded = false;

/**
 * Генерация фонетических вариантов латинского названия для матча с транслитерацией из кириллицы.
 * Имитирует как русскоязычный пользователь мог бы транслитерировать название:
 * "Bournemouth" -> ["bornmut", "bournmouth"] — ближе к русскому "Борнмут"
 * "Newcastle" -> ["nyukasl", "newkasl"] — ближе к русскому "Ньюкасл"
 */
function generatePhoneticVariants(name) {
  if (!name) return [];
  let lower = stripDiacritics(name.toLowerCase())
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (!lower) return [];
  
  const variants = new Set([lower]);
  
  // Замены English→Russian-transliteration patterns
  // Когда русский говорит "Борнмут", транслитерация даёт "bornmut"
  // А в БД "bournemouth". Нужно генерировать формы из DB, которые будут совпадать.
  const replacements = [
    // Гласные: ou→o, oo→u, ea→i, ee→i, ey→ey, ay→ey, ie→i
    [/ou/g, 'o'], [/oo/g, 'u'], [/ea/g, 'i'], [/ee/g, 'i'],
    [/ei/g, 'ey'], [/ai/g, 'ay'],
    // Окончания: -outh→-ut, -outh→-aut, -mouth→-mut
    [/mouth/g, 'mut'], [/outh/g, 'ut'],
    // th→t (русские обычно пишут "т" вместо "th")
    [/th/g, 't'], 
    // gh→g или ничего
    [/gh/g, 'g'], [/ght/g, 'yt'],
    // w→v (Вест→vest, West→vest)
    [/^w/g, 'v'], [/wh/g, 'v'],
    // ph→f
    [/ph/g, 'f'],
    // ck→k
    [/ck/g, 'k'],
    // ce→se, ci→si
    [/ce/g, 'se'], [/ci/g, 'si'],
    // ge→dzhe, gi→dzhi (Genoa→Dzhenoa)
    [/ge/g, 'dzhe'], [/gi/g, 'dzhi'],
    // j→dzh (Juventus→Yuventus)
    [/^j/g, 'yu'], [/j/g, 'dzh'],
    // ch→ch (already fine) but tch→ch
    [/tch/g, 'ch'],
    // sh→sh (already fine)
    // sch→sh
    [/sch/g, 'sh'],
    // qu→kv
    [/qu/g, 'kv'],
    // x→ks
    [/x/g, 'ks'],
    // double letters → single (Liverpool→Liverpul)
    [/ll/g, 'l'], [/tt/g, 't'], [/ss/g, 's'], [/ff/g, 'f'],
    [/pp/g, 'p'], [/rr/g, 'r'], [/nn/g, 'n'], [/mm/g, 'm'],
    [/dd/g, 'd'], [/bb/g, 'b'], [/cc/g, 'k'], [/gg/g, 'g'],
    // ü/ö/ä → u/o/a then → yu/e/e (German umlauts → Russian transliteration)
    [/ü/g, 'yu'], [/ö/g, 'e'], [/ä/g, 'e'],
    [/ue/g, 'yu'], [/oe/g, 'e'], [/ae/g, 'e'],
    // st at start → sht (Stuttgart→Shtutgart)
    [/^st/g, 'sht'],
    // ew→yu (Newcastle→Nyukasl)
    [/ew/g, 'yu'],
    // castle→kasl
    [/castle/g, 'kasl'],
    // ham→hem (West Ham → Вест Хэм → vest hem)
    [/ham($|\s)/g, 'hem$1'],
    // -field→-fild
    [/field/g, 'fild'],
    // -ampton→-empton
    [/ampton/g, 'empton'],
    // -bury→-beri
    [/bury/g, 'beri'],
    // -wich→-vich
    [/wich/g, 'vich'],
    // -pool→-pul
    [/pool/g, 'pul'],
    // -ley→-li
    [/ley/g, 'li'],
    // -ton→-ton (already fine)
    // -son→-son (already fine)
    // -ing→-ing (already fine)
    // -er→-er (already fine)
    // y→i at start (but not always)
    // i→ay sometimes
    // Crystal→Kristal
    [/^cr/g, 'kr'],
    // palace→pelas
    [/palace/g, 'pelas'],
    // bright→brayt
    [/bright/g, 'brayt'],
    // -igh→-ay
    [/igh/g, 'ay'],
    // leic→les (Leicester→Lester)
    [/leicester/g, 'lester'],
    // -ester→-ester (already fine)
    // sou→sau (Southampton→Sautgempton)
    [/sou/g, 'sau'],
    // borough→boro
    [/borough/g, 'boro'],
    // n't→n (can't→kan)
    // Rennes→Ren
    [/nnes/g, 'n'],
    [/sbourg/g, 'sburg'],
    // Eintracht→Ayntraht
    [/^ei/g, 'ay'],
    [/acht/g, 'aht'],
    // Gladbach→gladbah
    [/bach/g, 'bah'],
    // Hertha→Gerta
    [/^h(?=e)/g, 'g'],
    // Доп. паттерны для лучшего покрытия
    [/shire/g, 'shir'], [/chester/g, 'chester'],
    [/land/g, 'lend'], [/ford/g, 'ford'],
    [/wood/g, 'vud'], [/well/g, 'vel'],
    [/worth/g, 'vort'], [/burg/g, 'burg'],
    [/berg/g, 'berg'], [/town/g, 'taun'],
    [/city/g, 'siti'], [/park/g, 'park'],
    [/dale/g, 'deyl'], [/don($|\s)/g, 'don$1'],
    [/mont/g, 'mon'], [/roux/g, 'ru'],
    [/oux/g, 'u'], [/eau/g, 'o'],
    [/aux/g, 'o'], [/ille/g, 'il'],
    [/enne/g, 'en'], [/erre/g, 'er'],
    [/ette/g, 'et'], [/ois/g, 'ua'],
    [/ien/g, 'yen'], [/aire/g, 'er'],
    [/tion/g, 'sion'], [/teur/g, 'ter'],
    [/eur/g, 'er'], [/ault/g, 'o'],
    [/eaux/g, 'o'], [/oux/g, 'u'],
    [/heim/g, 'haym'], [/stein/g, 'shtayn'],
    [/wald/g, 'vald'], [/thal/g, 'tal'],
  ];
  
  // Apply each replacement independently
  for (const [pattern, replacement] of replacements) {
    const variant = lower.replace(pattern, replacement);
    if (variant !== lower) variants.add(variant);
  }
  
  // Generate a combined "full Russian transliteration" variant
  let ruVariant = lower;
  for (const [pattern, replacement] of replacements) {
    ruVariant = ruVariant.replace(pattern, replacement);
  }
  if (ruVariant !== lower) variants.add(ruVariant);
  
  // Generate per-word "russified" keywords for indexing
  const words = lower.split(/\s+/);
  for (const w of words) {
    if (w.length < 3) continue;
    let wRu = w;
    for (const [pattern, replacement] of replacements) {
      wRu = wRu.replace(pattern, replacement);
    }
    if (wRu !== w && wRu.length >= 3) variants.add(wRu);
  }
  
  return Array.from(variants);
}

/**
 * Генерация триграмм из строки (аналог pg_trgm)
 */
function getTrigrams(str) {
  if (!str) return new Set();
  const s = `  ${str.toLowerCase()} `;
  const trigrams = new Set();
  for (let i = 0; i < s.length - 2; i++) {
    trigrams.add(s.substring(i, i + 3));
  }
  return trigrams;
}

/**
 * Similarity между двумя строками по триграммам (аналог pg_trgm similarity)
 * Возвращает число от 0 до 1
 */
function trigramSimilarity(a, b) {
  const triA = getTrigrams(a);
  const triB = getTrigrams(b);
  if (triA.size === 0 && triB.size === 0) return 1;
  if (triA.size === 0 || triB.size === 0) return 0;
  let intersection = 0;
  for (const t of triA) {
    if (triB.has(t)) intersection++;
  }
  return intersection / (triA.size + triB.size - intersection);
}

/**
 * Загрузка всех команд из БД в кэш с построением триграммного индекса
 */
async function loadTeamsCache() {
  if (cacheLoaded) return;
  
  try {
    console.log('[Scout] Loading teams cache from database...');
    const result = await pool.query('SELECT id, name, short_name FROM teams');
    
    teamsCache.clear();
    teamsIndex.clear();
    trigramIndex.clear();
    
    for (const team of result.rows) {
      const normalized = normalizeForIndex(team.name);
      const keywords = extractIndexKeywords(team.name);
      const trigrams = getTrigrams(normalized);
      
      // Генерируем фонетические варианты из латинского имени
      // Это позволяет найти "Bournemouth" по запросу "Борнмут" (→ "bornmut")
      const phoneticVariants = generatePhoneticVariants(team.name);
      const shortPhoneticVariants = team.short_name ? generatePhoneticVariants(team.short_name) : [];
      const allNormalized = [normalized, ...phoneticVariants, ...shortPhoneticVariants];
      
      // Собираем триграммы из всех вариантов написания
      const allTrigrams = new Set(trigrams);
      for (const variant of allNormalized) {
        for (const tg of getTrigrams(variant)) {
          allTrigrams.add(tg);
        }
      }
      
      // Извлекаем ключевые слова из ВСЕХ вариантов (включая фонетические)
      // Это ключевое улучшение: если DB "bournemouth", а поиск "bornmut",
      // то "bornmut" будет в keywords индексе благодаря phoneticVariants
      const allKeywords = new Set(keywords);
      for (const variant of allNormalized) {
        const varWords = variant.split(/\s+/).filter(w => w.length >= 2);
        for (const vw of varWords) {
          allKeywords.add(vw);
        }
      }
      const allKeywordsArr = Array.from(allKeywords);
      
      teamsCache.set(team.id, {
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        normalized,
        allNormalized, // все варианты для сравнения
        keywords: allKeywordsArr,
        trigrams: allTrigrams
      });
      
      // Индексируем по ключевым словам (включая из фонетических вариантов)
      for (const kw of allKeywordsArr) {
        if (!teamsIndex.has(kw)) {
          teamsIndex.set(kw, new Set());
        }
        teamsIndex.get(kw).add(team.id);
      }
      
      // Индексируем по триграммам (включая фонетические варианты)
      for (const tg of allTrigrams) {
        if (!trigramIndex.has(tg)) {
          trigramIndex.set(tg, new Set());
        }
        trigramIndex.get(tg).add(team.id);
      }
    }
    
    // Строим индекс по префиксам
    buildPrefixIndex();
    
    cacheLoaded = true;
    console.log(`[Scout] Loaded ${teamsCache.size} teams, ${teamsIndex.size} keywords, ${prefixIndex.size} prefixes, ${trigramIndex.size} trigrams`);
  } catch (error) {
    console.error('[Scout] Error loading teams cache:', error.message);
  }
}

/**
 * Нормализация строки для индекса
 */
function normalizeForIndex(text) {
  if (!text) return '';
  return stripDiacritics(text.toLowerCase())
    .replace(/[\u2018\u2019\u0060']/g, '')  // Remove apostrophes without adding space (Ra'anana -> Raanana)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Извлечение ключевых слов для индекса
 */
function extractIndexKeywords(name) {
  if (!name) return [];
  
  const normalized = normalizeForIndex(name);
  const words = normalized.split(' ').filter(w => w.length >= 2);
  
  // Добавляем варианты написания
  const allKeywords = new Set();
  
  for (const word of words) {
    allKeywords.add(word);
    
    // Добавляем fuzzy варианты
    const variants = createFuzzyVariants(word);
    variants.forEach(v => allKeywords.add(v));
  }
  
  return Array.from(allKeywords);
}

function transliterate(text) {
  if (!text) return '';
  // Приводим к нижнему регистру для маппинга, потом транслитерируем
  // Используем ?? вместо || чтобы '' (для ъ и ь) не считалось falsy
  return text.split('').map(char => {
    const lower = char.toLowerCase();
    return cyrillicToLatin[lower] ?? char;
  }).join('');
}

/**
 * Levenshtein distance для fuzzy matching
 */
function levenshtein(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Создаёт варианты написания слова для fuzzy matching
 * Расширенная версия: покрывает все основные различия Cyrillic↔Latin транслитерации
 */
function createFuzzyVariants(word) {
  if (!word || word.length < 2) return [word];
  
  const variants = new Set([word]);
  
  const substitutions = [
    ['kh', 'h'], ['h', 'kh'],
    ['ph', 'f'], ['f', 'ph'], ['f', 'v'], ['v', 'f'],
    ['w', 'v'], ['v', 'w'],
    ['c', 'k'], ['k', 'c'],
    ['i', 'y'], ['y', 'i'],
    ['ts', 's'], ['ts', 'c'], ['s', 'ts'], ['c', 'ts'],
    ['ts', 'z'], ['z', 'ts'],
    ['tch', 'ch'], ['ch', 'tch'], ['ch', 'c'],
    ['sh', 'sch'], ['sch', 'sh'],
    ['zh', 'j'], ['j', 'zh'], ['zh', 'g'],
    ['yu', 'u'], ['u', 'yu'],
    ['ya', 'a'], ['a', 'ya'],
    ['ye', 'e'], ['e', 'ye'],
    ['yo', 'e'], ['yo', 'o'],
    ['ks', 'x'], ['x', 'ks'],
    ['dj', 'j'], ['j', 'dj'], ['dzh', 'j'], ['j', 'dzh'],
    ['ou', 'u'], ['u', 'ou'],
    ['oo', 'u'],
    ['ee', 'i'], ['ea', 'i'],
    ['th', 't'], ['t', 'th'],
    ['ght', 'yt'], ['ght', 'gt'],
    ['ey', 'ei'], ['ei', 'ey'], ['ay', 'ey'],
    ['ow', 'ou'], ['ow', 'av'],
    ['qu', 'kv'], ['kv', 'qu'],
    ['burgh', 'burg'], ['burg', 'burgh'],
    ['ss', 's'], ['ll', 'l'], ['tt', 't'], ['rr', 'r'], ['nn', 'n'],
    ['kh', 'x'], ['x', 'kh'], ['h', 'x'], ['x', 'h'],
    ['tsa', 'za'], ['za', 'tsa'],
    // Additional patterns for better coverage
    ['zh', 'dj'], ['dj', 'zh'],  // Джохор → Johor
    ['dzh', 'g'], ['g', 'dzh'],  // Джиронда → Gironda  
    ['kh', 'g'], ['g', 'kh'],    // Хетафе → Getafe
    ['h', 'g'],                    // Хетафе fallback
    ['tss', 'zz'], ['zz', 'tss'], // Лумеццане → Lumezzane
  ];
  
  for (const [from, to] of substitutions) {
    if (word.includes(from)) {
      const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      variants.add(word.replace(new RegExp(escaped, 'g'), to));
    }
    if (variants.size >= 20) break;
  }
  
  // Удаление удвоенных букв (liverpool → liverpol)
  const deduped = word.replace(/(.)\1/g, '$1');
  if (deduped !== word) variants.add(deduped);
  
  // Добавляем вариант с h в начале и без h (ospitalet → hospitalet)
  if (word.startsWith('h')) {
    variants.add(word.slice(1));
  } else if (word.length >= 4) {
    variants.add('h' + word);
  }
  
  return Array.from(variants);
}

/**
 * Нормализация имени команды из Excel (русский → латиница)
 */
function normalizeTeamName(name) {
  if (!name) return '';
  
  let normalized = name.toLowerCase().trim();
  
  // Сохраняем информацию о суффиксах перед их удалением
  const hasWomenSuffix = /\s*\(ж\)\s*$/i.test(normalized);
  const hasReserveSuffix = /\s*\(р\)\s*$/i.test(normalized);
  
  // Удаляем общие суффиксы
  normalized = normalized
    .replace(/\s*\(р\)\s*$/i, '')  // резерв
    .replace(/\s*\(ж\)\s*$/i, '')  // женщины
    .replace(/\s*fc\s*$/i, '')
    .replace(/\s*фк\s*$/i, '')
    .replace(/\s*sc\s*$/i, '')
    .replace(/\s*ск\s*$/i, '')
    .replace(/\s*u\d+\s*$/i, '')
    .replace(/\s*\(.*?\)\s*$/i, '');
  
  // Преобразуем русские аббревиатуры в латинские эквиваленты
  normalized = normalized
    .replace(/^кд\s+/i, 'cd ')   // КД → CD
    .replace(/^уд\s+/i, 'ud ')   // УД → UD
    .replace(/^ад\s+/i, 'ad ')   // АД → AD
    .replace(/^сд\s+/i, 'cd ')   // СД → CD
    .replace(/^афк\s+/i, 'afc ') // АФК → AFC
    .replace(/^цд\s+/i, 'cd ');  // ЦД → CD
  
  // Применяем прямой маппинг (до транслитерации) - сначала полное имя
  const mapped = teamNameMappings[normalized];
  if (mapped) {
    return mapped
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Пробуем маппинг без географических суффиксов (РЖ, РС и т.д.)
  const withoutGeo = normalized
    .replace(/\s+рж\s*$/i, '')   // Рио-де-Жанейро
    .replace(/\s+рс\s*$/i, '')   // Риу-Гранди-ду-Сул
    .replace(/\s+сп\s*$/i, '')   // Сан-Паулу
    .replace(/\s+мг\s*$/i, '')   // Минас-Жерайс
    .replace(/\s+пр\s*$/i, '')   // Парана
    .replace(/\s+2\s*$/i, '')    // дублирующий состав (Толука 2)
    .replace(/\s+ii\s*$/i, '')   // дублирующий состав (Benfica II)
    .replace(/\s+w\s*$/i, '')    // женские команды (Twente W)
    .trim();
  
  if (withoutGeo !== normalized) {
    const mappedGeo = teamNameMappings[withoutGeo];
    if (mappedGeo) {
      return mappedGeo
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  
  // Транслитерация кириллицы
  normalized = transliterate(normalized);
  
  // Удаляем диакритические знаки и очищаем
  normalized = stripDiacritics(normalized)
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return normalized;
}

// Стоп-слова
const stopWords = new Set([
  'fc', 'sc', 'fk', 'sk', 'cf', 'ac', 'as', 'ss', 'cd', 'ud', 'ad',
  'united', 'city', 'town', 'athletic', 'sporting', 'real', 'club',
  'reserve', 'res', 'youth', 'junior', 'senior', 'women', 'ladies',
  'u18', 'u19', 'u20', 'u21', 'u22', 'u23', 'ii', 'iii', 'iv', 'b',
  'academy', 'development', 'reserves',
  'al', 'el', 'de', 'la', 'le', 'do', 'da', 'di', 'du', 'des', 'los', 'las'
]);

/**
 * Извлечение ключевых слов из названия команды (русский)
 */
function extractSearchKeywords(name) {
  if (!name) return [];
  
  const normalized = normalizeTeamName(name);
  const words = normalized.split(' ')
    .filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));
  
  // Добавляем fuzzy варианты
  const allKeywords = new Set();
  
  for (const word of words) {
    allKeywords.add(word);
    const variants = createFuzzyVariants(word);
    variants.forEach(v => allKeywords.add(v));
  }
  
  return Array.from(allKeywords);
}

// Индекс по префиксам (4 символа) для быстрого поиска
let prefixIndex = new Map(); // prefix -> Set<keyword>

/**
 * Построить индекс по префиксам
 */
function buildPrefixIndex() {
  prefixIndex.clear();
  for (const kw of teamsIndex.keys()) {
    if (kw.length >= 4) {
      const prefix = kw.slice(0, 4);
      if (!prefixIndex.has(prefix)) {
        prefixIndex.set(prefix, new Set());
      }
      prefixIndex.get(prefix).add(kw);
    }
  }
}

/**
 * Поиск команд в кэше по ключевым словам (быстрый, keyword + prefix + Levenshtein)
 */
function findTeamsByKeywords(keywords) {
  const teamScores = new Map(); // teamId -> score
  
  for (const kw of keywords) {
    if (kw.length < 2) continue;
    
    // 1. Точное совпадение ключевого слова (O(1))
    if (teamsIndex.has(kw)) {
      for (const teamId of teamsIndex.get(kw)) {
        teamScores.set(teamId, (teamScores.get(teamId) || 0) + 10);
      }
    }
    
    // 2. Поиск по префиксу + Levenshtein через prefixIndex
    if (kw.length >= 4) {
      const prefix = kw.slice(0, 4);
      const relatedKeywords = prefixIndex.get(prefix);
      if (relatedKeywords) {
        for (const indexKw of relatedKeywords) {
          if (indexKw === kw) continue;
          if (!teamsIndex.has(indexKw)) continue;
          
          let matchScore = 3;
          
          if (kw.length >= 5 && indexKw.length >= 4) {
            const maxDist = kw.length <= 5 ? 1 : 2;
            if (Math.abs(indexKw.length - kw.length) <= maxDist) {
              const dist = levenshtein(kw, indexKw);
              if (dist <= maxDist) {
                matchScore = Math.max(matchScore, 5 - dist);
              }
            }
          }
          
          for (const teamId of teamsIndex.get(indexKw)) {
            teamScores.set(teamId, (teamScores.get(teamId) || 0) + matchScore);
          }
        }
      }
    }
  }
  
  return Array.from(teamScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([teamId, score]) => ({
      ...teamsCache.get(teamId),
      searchScore: score
    }));
}

/**
 * Поиск команд по триграммам (in-memory pg_trgm аналог)
 * Быстрее чем полный перебор благодаря триграммному индексу
 */
function findTeamsByTrigrams(searchText) {
  if (!searchText || searchText.length < 2) return [];
  
  const searchTrigrams = getTrigrams(searchText);
  if (searchTrigrams.size === 0) return [];
  
  // Собираем кандидатов через триграммный индекс
  // (только команды, которые имеют хотя бы 1 общую триграмму)
  const candidateCounts = new Map(); // teamId -> count of matching trigrams
  
  for (const tg of searchTrigrams) {
    const teamIds = trigramIndex.get(tg);
    if (teamIds) {
      for (const teamId of teamIds) {
        candidateCounts.set(teamId, (candidateCounts.get(teamId) || 0) + 1);
      }
    }
  }
  
  // Фильтруем: минимум 2 общих триграммы для кандидатов
  const minTrigrams = Math.max(2, Math.floor(searchTrigrams.size * 0.15));
  const candidates = [];
  
  for (const [teamId, count] of candidateCounts) {
    if (count >= minTrigrams) {
      candidates.push(teamId);
    }
  }
  
  // Считаем точный similarity для топ кандидатов (ограничиваем до 200 для скорости)
  candidates.sort((a, b) => (candidateCounts.get(b) || 0) - (candidateCounts.get(a) || 0));
  const topCandidates = candidates.slice(0, 200);
  
  const results = [];
  for (const teamId of topCandidates) {
    const team = teamsCache.get(teamId);
    if (!team) continue;
    
    // Сравниваем со всеми вариантами написания (включая фонетические)
    let bestSim = trigramSimilarity(searchText, team.normalized);
    if (team.allNormalized) {
      for (const variant of team.allNormalized) {
        const sim = trigramSimilarity(searchText, variant);
        if (sim > bestSim) bestSim = sim;
      }
    }
    
    if (bestSim >= 0.25) {
      results.push({
        ...team,
        searchScore: Math.round(bestSim * 100)
      });
    }
  }
  
  results.sort((a, b) => b.searchScore - a.searchScore);
  return results.slice(0, 40);
}

/**
 * Комбинированный поиск: keywords + trigrams
 * Используется для поиска команд из Excel (русские названия)
 */
function findTeamsCombined(teamName) {
  if (!teamName) return [];
  
  const normalized = normalizeTeamName(teamName);
  const keywords = extractSearchKeywords(teamName);
  
  // 1. Быстрый поиск по ключевым словам
  const keywordResults = findTeamsByKeywords(keywords);
  
  // Если нашли хорошее совпадение (score >= 10 = точное совпадение слова) — возвращаем
  if (keywordResults.length > 0 && keywordResults[0].searchScore >= 10) {
    return keywordResults;
  }
  
  // 2. Триграммный поиск по нормализованному имени
  const trigramResults = findTeamsByTrigrams(normalized);
  
  // 3. Объединяем результаты (keyword score + trigram score)
  const merged = new Map(); // teamId -> score
  
  for (const r of keywordResults) {
    merged.set(r.id, { ...r, searchScore: r.searchScore * 2 }); // keyword match весит больше
  }
  
  for (const r of trigramResults) {
    if (merged.has(r.id)) {
      const existing = merged.get(r.id);
      existing.searchScore += r.searchScore;
    } else {
      merged.set(r.id, { ...r });
    }
  }
  

    // Substring matching: scout short name inside DB team name
    // Examples: MINNESOTA -> Minnesota United II, ENCARNACION -> Encarnación
    const firstWord = normalized.split(' ')[0];
    if (firstWord && firstWord.length >= 4) {
      for (const team of teamsCache.values()) {
        if (merged.has(team.id)) continue;
        const dbNorm = String(team.normalized || '').toLowerCase();
        const dbName = String(team.name || '').toLowerCase();
        if (dbNorm.includes(firstWord.toLowerCase()) || dbName.includes(firstWord.toLowerCase())) {
          merged.set(team.id, { ...team, searchScore: 30 });
        }
      }
    }
  return Array.from(merged.values())
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, 40);
}

function excelDateToJS(excelDate) {
  if (!excelDate) return null;
  if (typeof excelDate === 'string') {
			// Парсим DD.MM.YYYY HH:MM
			const match = excelDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(\s+(\d{1,2}):(\d{2}))?/);
			if (match) {
				const [, day, month, year, , hour, minute] = match;
				return new Date(Date.UTC(
					parseInt(year),
					parseInt(month) - 1,
					parseInt(day),
					parseInt(hour || 0),
					parseInt(minute || 0)
				));
			}
			return new Date(excelDate);
  }
  const date = new Date((excelDate - 25569) * 86400 * 1000);
  return date;
}

function parseEventName(eventName) {
  if (!eventName) return { home: null, away: null };
  
  const separators = [' — ', ' - ', ' – ', ' vs ', ' против '];
  
  for (const sep of separators) {
    if (eventName.includes(sep)) {
      const parts = eventName.split(sep);
      return {
        home: parts[0]?.trim(),
        away: parts[1]?.trim()
      };
    }
  }
  
  return { home: eventName, away: null };
}

/**
 * Fallback поиск через ILIKE в БД
 */
async function findGameByILIKE(homeKeywords, awayKeywords, dateFrom, dateTo) {
  // Берём самые важные ключевые слова (длина >= 4)
  const homeKws = homeKeywords.filter(k => k.length >= 4).slice(0, 3);
  const awayKws = awayKeywords.filter(k => k.length >= 4).slice(0, 3);
  
  if (homeKws.length === 0 && awayKws.length === 0) return [];
  
  const allKws = [...homeKws, ...awayKws];
  const conditions = allKws.map((_, i) => 
    `(LOWER(th.name) ILIKE $${i + 3} OR LOWER(ta.name) ILIKE $${i + 3})`
  );
  
  const query = `
    SELECT 
      g.id,
      g.sstats_id,
      g.date,
      g.home_score,
      g.away_score,
      g.status,
      g.is_finished,
      g.home_team_id,
      g.away_team_id,
      th.name as home_team,
      ta.name as away_team,
      l.name as league
    FROM games g
    LEFT JOIN teams th ON g.home_team_id = th.id
    LEFT JOIN teams ta ON g.away_team_id = ta.id
    LEFT JOIN leagues l ON g.league_id = l.id
    WHERE g.date >= $1 AND g.date < $2
      AND (${conditions.join(' OR ')})
    ORDER BY g.date
    LIMIT 50
  `;
  
  const params = [dateFrom.toISOString(), dateTo.toISOString(), ...allKws.map(k => `%${k}%`)];
  return pool.query(query, params);
}

/**
 * Оценка качества совпадения матчей по ключевым словам
 */
function evaluateMatches(rows, homeKeywords, awayKeywords, searchDate) {
  const matches = rows.map(row => {
    const dbHome = (row.home_team || '').toLowerCase();
    const dbAway = (row.away_team || '').toLowerCase();
    
    let homeInHome = 0, homeInAway = 0, awayInHome = 0, awayInAway = 0;
    
    // Считаем совпадения ключевых слов
    for (const kw of homeKeywords) {
      if (kw.length >= 3) {
        if (dbHome.includes(kw)) homeInHome++;
        if (dbAway.includes(kw)) homeInAway++;
      }
    }
    
    for (const kw of awayKeywords) {
      if (kw.length >= 3) {
        if (dbHome.includes(kw)) awayInHome++;
        if (dbAway.includes(kw)) awayInAway++;
      }
    }
    
    // Определяем направление
    const normalScore = homeInHome * 3 + awayInAway * 3;
    const swappedScore = homeInAway * 3 + awayInHome * 3;
    
    let teamsSwapped = swappedScore > normalScore;
    let score = Math.max(normalScore, swappedScore);
    
    // Требуем хотя бы одно совпадение для каждой команды
    const bothTeamsNormal = homeInHome > 0 && awayInAway > 0;
    const bothTeamsSwapped = homeInAway > 0 && awayInHome > 0;
    
    if (bothTeamsNormal || bothTeamsSwapped) {
      score += 20;
    } else {
      score = score * 0.3;
    }
    
    // Бонус за дату
    const rowDate = new Date(row.date).toISOString().split('T')[0];
    const searchDateStr = searchDate.toISOString().split('T')[0];
    if (rowDate === searchDateStr) score += 10;
    
    return {
      ...row,
      matchScore: Math.round(score),
      teamsSwapped,
      matchDetails: { bothTeamsNormal, bothTeamsSwapped }
    };
  });
  
  matches.sort((a, b) => b.matchScore - a.matchScore);
  
  return matches.filter(m => 
    m.matchScore > 25 && 
    (m.matchDetails.bothTeamsNormal || m.matchDetails.bothTeamsSwapped)
  );
}

/**
 * Улучшенный поиск матча в БД с использованием кэша команд
 */
async function findGameInDB(homeTeam, awayTeam, date, competition) {
  
  if (!homeTeam || !date) return [];
  
  // Предобработка имён команд для лучшего сопоставления
  function preprocessTeamName(name) {
    if (!name) return name;
    let processed = name;
    // Конвертируем (ж) → W для женских команд
    if (/\s*\(ж\)\s*$/.test(processed)) {
      processed = processed.replace(/\s*\(ж\)\s*$/, ' W');
    }
    // Конвертируем русские аббревиатуры
    processed = processed
      .replace(/^КД\s+/i, 'CD ')
      .replace(/^УД\s+/i, 'UD ')
      .replace(/^АД\s+/i, 'AD ')
      .replace(/^СД\s+/i, 'CD ')
      .replace(/^ФК\s+/i, '')
      .replace(/^АФК\s+/i, 'AFC ');
    // Конвертируем " 2" в " II" для резервных команд
    if (/\s+2\s*$/.test(processed)) {
      processed = processed.replace(/\s+2\s*$/, ' II');
    }
    return processed;
  }
  
  homeTeam = preprocessTeamName(homeTeam);
  awayTeam = preprocessTeamName(awayTeam);

  
  // Загружаем кэш если нужно
  await loadTeamsCache();
  
  // Комбинированный поиск (keywords + trigrams + mapping)
  const homeCandidates = findTeamsCombined(homeTeam);
  const awayCandidates = findTeamsCombined(awayTeam);
  
  // DEBUG: trace matching
  
  // Диапазон дат: полный день события (00:00 - 23:59) + запас для timezone
  const searchDate = new Date(date);
  // Обнуляем время до полуночи чтобы искать весь день
  const dateFrom = new Date(searchDate);
  dateFrom.setUTCHours(0, 0, 0, 0); // начало дня UTC
  dateFrom.setDate(dateFrom.getDate() - 2); // -1 день назад для покрытия timezone (матч 22:45 UTC = следующий день по местному)
  const dateTo = new Date(searchDate);
  dateTo.setUTCHours(0, 0, 0, 0);
  dateTo.setDate(dateTo.getDate() + 3); // +2 дня вперёд для покрытия timezone-разниц
  
  // Если in-memory поиск не дал результатов или результатов мало — fallback через pg_trgm в БД
  const bestHomeScore = homeCandidates.length > 0 ? homeCandidates[0].searchScore : 0;
  const bestAwayScore = awayCandidates.length > 0 ? awayCandidates[0].searchScore : 0;
  if (homeCandidates.length === 0 || awayCandidates.length === 0 || (bestHomeScore < 5 && bestAwayScore < 5)) {
    try {
      return await findGameByDBSimilarity(homeTeam, awayTeam, dateFrom, dateTo, searchDate);
    } catch (error) {
      console.error('DB similarity fallback error:', error.message);
    }
    return [];
  }
  
  try {
    // Собираем ID команд-кандидатов
    const homeIds = homeCandidates.slice(0, 20).map(t => t.id);
    const awayIds = awayCandidates.slice(0, 20).map(t => t.id);
    
    // Расширяем кандидатов: добавляем варианты с суффиксами U18/U19/U21/U23/Res./W
    // Это позволяет найти "QPR U21" если в кандидатах есть только "QPR"
    const expandedHomeIds = new Set(homeIds);
    const expandedAwayIds = new Set(awayIds);
    for (const [teamId, teamData] of teamsCache) {
      const teamName = (teamData.name || '').toLowerCase();
      // Проверяем, является ли эта команда вариантом одного из кандидатов
      for (const cand of homeCandidates.slice(0, 10)) {
        const candName = (cand.name || '').toLowerCase();
        if (teamName.startsWith(candName) && teamName !== candName && 
            /\s+(u\d{2}|res\.?|w|ii|reserves?)$/i.test(teamName.slice(candName.length))) {
          expandedHomeIds.add(teamId);
        }
      }
      for (const cand of awayCandidates.slice(0, 10)) {
        const candName = (cand.name || '').toLowerCase();
        if (teamName.startsWith(candName) && teamName !== candName && 
            /\s+(u\d{2}|res\.?|w|ii|reserves?)$/i.test(teamName.slice(candName.length))) {
          expandedAwayIds.add(teamId);
        }
      }
    }
    
    const allIds = [...new Set([...expandedHomeIds, ...expandedAwayIds])];
    
    if (allIds.length === 0) {
      return [];
    }
    
    // Ищем матчи где хотя бы одна команда из кандидатов
    const query = `
      SELECT 
        g.id,
        g.sstats_id,
        g.date,
        g.home_score,
        g.away_score,
        g.status,
        g.is_finished,
        g.home_team_id,
        g.away_team_id,
        th.name as home_team,
        ta.name as away_team,
        l.name as league
      FROM games g
      LEFT JOIN teams th ON g.home_team_id = th.id
      LEFT JOIN teams ta ON g.away_team_id = ta.id
      LEFT JOIN leagues l ON g.league_id = l.id
      WHERE g.date >= $1 AND g.date < $2
        AND (g.home_team_id = ANY($3) OR g.away_team_id = ANY($3))
      ORDER BY g.date
      LIMIT 100
    `;
    
    const result = await pool.query(query, [dateFrom.toISOString(), dateTo.toISOString(), allIds]);

    
    // Оцениваем качество совпадения с верификацией названий
    const normalizedHome = normalizeTeamName(homeTeam);
    const normalizedAway = normalizeTeamName(awayTeam);
    
    // Определяем возрастные категории (U19/U20/U21/U23/W) для фильтрации
    const homeYouth = (homeTeam || '').match(/\bU(\d{2})\b/i)?.[0]?.toUpperCase() || '';
    const awayYouth = (awayTeam || '').match(/\bU(\d{2})\b/i)?.[0]?.toUpperCase() || '';
    // Дополнительные признаки молодёжного события: "До X лет", "Молодежная", "Юношеская", "Резервная", "Jong", "Youth", "Development"
    const competitionYouth = /до \d+ (лет|года)|молодеж|юношес|резервн|youth|development|u\d{2}/i.test(competition || '');
    const teamYouth = /(?:^|\s)йонг(?:\s|$)|\bjong\b|\bjuven[iu]|\(р\)/i.test(homeTeam + ' ' + awayTeam);
    const isYouthEvent = homeYouth || awayYouth || competitionYouth || teamYouth;
    const isWomenEvent = /\(ж\)|\bW\b|\bwomen\b|\bladies\b|женщин|женская|Жен\./i.test(homeTeam + ' ' + awayTeam + ' ' + (competition || ''));
    
    const matches = result.rows.map(row => {
      let score = 0;
      let teamsSwapped = false;
      
      const homeInHome = expandedHomeIds.has(row.home_team_id);
      const homeInAway = expandedHomeIds.has(row.away_team_id);
      const awayInHome = expandedAwayIds.has(row.home_team_id);
      const awayInAway = expandedAwayIds.has(row.away_team_id);
      
      const normalScore = (homeInHome ? 10 : 0) + (awayInAway ? 10 : 0);
      const swappedScore = (homeInAway ? 10 : 0) + (awayInHome ? 10 : 0);
      
      if (swappedScore > normalScore) {
        teamsSwapped = true;
        score = swappedScore;
      } else {
        score = normalScore;
      }
      
      const bothTeamsNormal = homeInHome && awayInAway;
      const bothTeamsSwapped = homeInAway && awayInHome;
      
      if (!bothTeamsNormal && !bothTeamsSwapped) {
        score = score * 0.3;
      } else {
        score += 20;
      }
      
      // Добавляем score из поиска кандидатов
      const homeCandidate = homeCandidates.find(c => c.id === (teamsSwapped ? row.away_team_id : row.home_team_id));
      const awayCandidate = awayCandidates.find(c => c.id === (teamsSwapped ? row.home_team_id : row.away_team_id));
      
      if (homeCandidate) score += homeCandidate.searchScore;
      if (awayCandidate) score += awayCandidate.searchScore;
      
      // Бонус за точное совпадение даты
      const rowDate = new Date(row.date).toISOString().split('T')[0];
      const searchDateStr = searchDate.toISOString().split('T')[0];
      if (rowDate === searchDateStr) score += 10;
      
      // Верификация: проверяем фактическое сходство названий команд
      // Это предотвращает ложные совпадения типа "Аль-Гарафа" -> "Damascus Al-Ahli"
      const dbHome = (row.home_team || '').toLowerCase();
      const dbAway = (row.away_team || '').toLowerCase();
      let nameSim = 0;
      if (!teamsSwapped) {
        nameSim = trigramSimilarity(normalizedHome, dbHome) + trigramSimilarity(normalizedAway, dbAway);
      } else {
        nameSim = trigramSimilarity(normalizedHome, dbAway) + trigramSimilarity(normalizedAway, dbHome);
      }
      // Адаптивный штраф: если обе команды найдены в кандидатах (bothTeamsNormal/Swapped),
      // доверяем поиску больше — транслитерация кириллицы даёт низкий trigram similarity
      // даже для правильных совпадений (напр. kristal pelas vs crystal palace = 0.16)
      const hasBothTeams = bothTeamsNormal || bothTeamsSwapped;
      const candidateScoreTotal = (homeCandidate ? homeCandidate.searchScore : 0) + (awayCandidate ? awayCandidate.searchScore : 0);
      
      if (hasBothTeams && candidateScoreTotal >= 10) {
        // Обе команды найдены с хорошим candidate score — мягкий штраф только для подозрительных
        // Транслитерация кириллицы даёт очень разные строки (bornmut vs bournemouth = sim 0.09)
        // Поэтому при высоком candidateScore доверяем поиску больше
        if (candidateScoreTotal >= 20) {
          // Очень хорошие кандидаты — минимальный штраф
          if (nameSim < 0.05) {
            score = score * 0.5; // совсем нет сходства — подозрительно
          }
          // nameSim >= 0.05 — без штрафа при сильных кандидатах
        } else {
          if (nameSim < 0.1) {
            score = score * 0.4;
          } else if (nameSim < 0.2) {
            score = score * 0.8;
          }
        }
        // При candidateScoreTotal >= 10 и nameSim >= 0.2 — без штрафа
      } else {
        // Только одна команда найдена или слабые кандидаты — строже проверяем
        if (nameSim < 0.3) {
          score = score * 0.2;
        } else if (nameSim < 0.5) {
          score = score * 0.5;
        }
      }
      
      // Штраф за несовпадение возрастной категории
      // Если событие U19 а матч не U19 — сильно штрафуем (и наоборот)
      const dbHomeName = (row.home_team || '').toUpperCase();
      const dbAwayName = (row.away_team || '').toUpperCase();
      const dbLeagueName = (row.league || '').toUpperCase();
      const dbHasYouth = /\bU\d{2}\b|\bJONG\b|\bJUNIORS?\b/.test(dbHomeName + ' ' + dbAwayName) ||
                         /\bU\d{2}\b|YOUTH|JUNIOR|PRIMAVERA|JUVENIL/.test(dbLeagueName);
      const dbHasWomen = /\bW\b|WOMEN|LADIES/.test(dbHomeName + ' ' + dbAwayName) ||
                         /WOMEN|FEMIN|FRAUEN|FEMENIN|KVINN|DAMER/.test(dbLeagueName);
      const dbHasReserve = /\b(II|III|RESERVE|RES\.?)\s*$/.test(dbHomeName) || /\b(II|III|RESERVE|RES\.?)\s*$/.test(dbAwayName) ||
                           /RESERVE|DISKI/.test(dbLeagueName);
      const isReserveEvent = /\(р\)|резервн|reserve/i.test(homeTeam + ' ' + awayTeam + ' ' + (competition || ''));
      
      // Жёсткий штраф за кросс-категорию: женщины <-> мужчины, юношеские <-> взрослые
      if (isYouthEvent && !dbHasYouth) {
        score = score * 0.05; // событие молодёжное, матч взрослый — почти блокируем
      } else if (!isYouthEvent && dbHasYouth) {
        score = score * 0.05; // событие взрослое, матч молодёжный
      }
      if (isWomenEvent && !dbHasWomen) {
        score = score * 0.05; // женский матч vs мужской — блокируем
      } else if (!isWomenEvent && dbHasWomen) {
        score = score * 0.05;
      }
      if (isReserveEvent && !dbHasReserve) {
        score = score * 0.10; // резервный матч vs основной
      } else if (!isReserveEvent && dbHasReserve && !isYouthEvent) {
        score = score * 0.20; // основной vs резервный (менее строго)
      }
      
      return { 
        ...row, 
        matchScore: Math.round(score), 
        teamsSwapped,
        nameSimilarity: Math.round(nameSim * 100) / 100,
        matchDetails: { bothTeamsNormal, bothTeamsSwapped }
      };
    });
    
    matches.sort((a, b) => b.matchScore - a.matchScore);
    
    // DBG: log top 5 scored matches
    
    // Возвращаем лучшие совпадения с проверкой минимального сходства
    const goodMatches = matches.filter(m => 
      m.matchScore > 25 && 
      (m.matchDetails.bothTeamsNormal || m.matchDetails.bothTeamsSwapped) &&
      m.nameSimilarity >= 0.03 // минимальный порог: кириллица→латиница даёт sim ~0.05-0.1 для правильных матчей
    );
    
    if (goodMatches.length > 0) return goodMatches;
    
    // Если нашли только одну команду — НЕ возвращаем результат, чтобы избежать ложных совпадений
    // Для надежного сопоставления требуется совпадение обеих команд
    
    return [];
    
  } catch (error) {
    console.error('Error finding game:', error.message);
    return [];
  }
}

/**
 * Поиск игры через pg_trgm similarity в БД (fallback)
 * Используется когда in-memory поиск не дал хороших результатов
 */
async function findGameByDBSimilarity(homeTeam, awayTeam, dateFrom, dateTo, searchDate) {
  const homeNorm = normalizeTeamName(homeTeam);
  const awayNorm = normalizeTeamName(awayTeam);
  
  if (!homeNorm && !awayNorm) return [];
  
  // Используем pg_trgm similarity для поиска матчей
  const query = `
    SELECT 
      g.id,
      g.sstats_id,
      g.date,
      g.home_score,
      g.away_score,
      g.status,
      g.is_finished,
      g.home_team_id,
      g.away_team_id,
      th.name as home_team,
      ta.name as away_team,
      l.name as league,
      GREATEST(
        similarity(LOWER(th.name), $3) + similarity(LOWER(ta.name), $4),
        similarity(LOWER(th.name), $4) + similarity(LOWER(ta.name), $3)
      ) as combined_sim
    FROM games g
    LEFT JOIN teams th ON g.home_team_id = th.id
    LEFT JOIN teams ta ON g.away_team_id = ta.id
    LEFT JOIN leagues l ON g.league_id = l.id
    WHERE g.date >= $1 AND g.date < $2
      AND (
        similarity(LOWER(th.name), $3) > 0.15 OR similarity(LOWER(ta.name), $3) > 0.15
        OR similarity(LOWER(th.name), $4) > 0.15 OR similarity(LOWER(ta.name), $4) > 0.15
      )
    ORDER BY combined_sim DESC
    LIMIT 10
  `;
  
  try {
    const result = await pool.query(query, [
      dateFrom.toISOString(), 
      dateTo.toISOString(),
      homeNorm,
      awayNorm
    ]);
    
    if (result.rows.length === 0) return [];
    
    const searchDateStr = searchDate.toISOString().split('T')[0];
    
    return result.rows
      .filter(row => row.combined_sim >= 0.25) // Минимальный порог similarity
      .map(row => {
        const homeSim1 = trigramSimilarity(homeNorm, (row.home_team || '').toLowerCase());
        const awaySim1 = trigramSimilarity(awayNorm, (row.away_team || '').toLowerCase());
        const homeSim2 = trigramSimilarity(homeNorm, (row.away_team || '').toLowerCase());
        const awaySim2 = trigramSimilarity(awayNorm, (row.home_team || '').toLowerCase());
        
        const normalScore = homeSim1 + awaySim1;
        const swappedScore = homeSim2 + awaySim2;
        const teamsSwapped = swappedScore > normalScore;
        const bestScore = Math.max(normalScore, swappedScore);
        
        const bothTeamsNormal = homeSim1 > 0.2 && awaySim1 > 0.2;
        const bothTeamsSwapped = homeSim2 > 0.2 && awaySim2 > 0.2;
        
        let matchScore = Math.round(bestScore * 100);
        if (bothTeamsNormal || bothTeamsSwapped) matchScore += 20;
        
        const rowDate = new Date(row.date).toISOString().split('T')[0];
        if (rowDate === searchDateStr) matchScore += 10;
        
        return {
          ...row,
          matchScore,
          teamsSwapped,
          matchDetails: { bothTeamsNormal, bothTeamsSwapped }
        };
      })
      .filter(m => m.matchDetails.bothTeamsNormal || m.matchDetails.bothTeamsSwapped)
      .sort((a, b) => b.matchScore - a.matchScore);
  } catch (error) {
    console.error('DB similarity error:', error.message);
    return [];
  }
}

/**
 * Регистрация маршрутов
 */
async function scoutRoutes(fastify, options) {
  
  // Предзагрузка кэша команд
  loadTeamsCache().catch(console.error);
  
  // Загрузка и парсинг Excel файла
  fastify.post('/api/scout/upload', async (request, reply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }
      
      const buffer = await data.toBuffer();
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      const results = [];
      
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        // --- Определяем формат по заголовку ---
        const headerRow = rows[0] || [];
        const headerNorm = headerRow.map(h => String(h ?? '').trim().toLowerCase());

        // Поиск колонки по ключевым словам
        const findCol = (...keys) => {
          for (const k of keys) {
            const idx = headerNorm.findIndex(h => h.includes(k));
            if (idx !== -1) return idx;
          }
          return -1;
        };

        const colSport    = findCol('sport', 'вид спорта');
        const colEvent    = findCol('event', 'событие', 'матч');
        const colT1       = findCol('t1', 'home', 'команда 1', 'хозяева');
        const colT2       = findCol('t2', 'away', 'команда 2', 'гости');
        const colDate     = findCol('start date', 'date', 'дата');
        const colTime     = findCol('time', 'время');
        const colLeague   = findCol('league', 'competition', 'location', 'лига', 'турнир', 'соревнование');
        const colSources  = findCol('sources', 'source', 'источник');

        // Скаут-колонки (Ven = скаут на матче, Tv = смотрим по ТВ)
        const colGenius   = findCol('genius');
        const colRunning  = findCol('running');
        const colRadar    = findCol('radar');
        const colFeedcon  = findCol('feedcon', 'feed con');
        const colImg      = findCol('img');
        const colRts      = findCol('rts', 'enet');

        // Определяем формат файла
        const isFmtB = colT1 !== -1 && colT2 !== -1;        // Формат B: T1/T2 колонки (все футбол)
        const isFmtA = colSport !== -1 && colEvent !== -1;  // Формат A: Sport + Event колонки

        const FOOTBALL_SPORTS = new Set(['soccer', 'football', 'футбол', 'fútbol']);

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 2) continue;

          const cellStr = (idx) => (idx !== -1 && row[idx] != null) ? String(row[idx]).trim() : '';

          let dateExcel, timeExcel, sportVal, competition, eventName, homeTeam, awayTeam, sourcesVal;
          let genius, running, radar, feedcon, img, rts;

          // Извлекаем скаут-данные (общие для всех форматов)
          genius   = cellStr(colGenius);
          running  = cellStr(colRunning);
          radar    = cellStr(colRadar);
          feedcon  = cellStr(colFeedcon);
          img      = cellStr(colImg);
          rts      = cellStr(colRts);

          if (isFmtB) {
            // Формат B: DATE | TIME | COUNTRY | LEAGUE | T1 | T2 | ... (все футбол)
            dateExcel   = colDate !== -1 ? row[colDate] : row[0];
            timeExcel   = colTime !== -1 ? row[colTime] : null;
            competition = cellStr(colLeague);
            homeTeam    = cellStr(colT1);
            awayTeam    = cellStr(colT2);
            eventName   = homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : (homeTeam || '');
            sportVal    = 'football';
            sourcesVal  = cellStr(colSources);
            if (!homeTeam && !awayTeam) continue;

          } else if (isFmtA) {
            // Формат A: Start Date | Sport | Location | Event | ... (смешанный спорт)
            dateExcel   = colDate !== -1 ? row[colDate] : row[0];
            sportVal    = cellStr(colSport);
            competition = cellStr(colLeague);
            eventName   = cellStr(colEvent);
            sourcesVal  = cellStr(colSources);
            const parsed = parseEventName(eventName);
            homeTeam    = parsed.home;
            awayTeam    = parsed.away;
            if (!sportVal || !FOOTBALL_SPORTS.has(sportVal.toLowerCase())) continue;
            if (!eventName) continue;

          } else {
            // Формат C (legacy): [dateExcel, sport, competition, eventName, sources]
            dateExcel   = row[0];
            sportVal    = row[1];
            competition = row[2] != null ? String(row[2]).trim() : '';
            eventName   = row[3] != null ? String(row[3]).trim() : '';
            sourcesVal  = row[4] != null ? String(row[4]).trim() : '';
            const sportStr = sportVal != null ? String(sportVal).trim().toLowerCase() : '';
            if (sportStr && !FOOTBALL_SPORTS.has(sportStr)) continue;
            const parsed = parseEventName(eventName);
            homeTeam    = parsed.home;
            awayTeam    = parsed.away;
          }

          // Skip Simulated Reality (virtual matches not in DB)
          if (competition && String(competition).toLowerCase().includes('simulated')) continue;

          // Парсинг даты + опциональное время
          let date = excelDateToJS(dateExcel);
          if (date && timeExcel != null) {
            const t = excelDateToJS(timeExcel);
            if (t) {
              date = new Date(date.getTime() + t.getUTCHours() * 3600000 + t.getUTCMinutes() * 60000);
            }
          }

          if (!homeTeam && !awayTeam) continue;

          results.push({
            rowNum: i + 1,
            date: date ? date.toISOString() : null,
            dateFormatted: date ? date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) : null,
            sport: sportVal,
            competition,
            eventName,
            homeTeam,
            awayTeam,
            homeKeywords: extractSearchKeywords(homeTeam),
            awayKeywords: extractSearchKeywords(awayTeam),
            sources: sourcesVal,
            genius,
            running,
            radar,
            feedcon,
            img,
            rts,
            result: null,
            matchFound: false
          });
        }
      }
      
      return {
        success: true,
        totalRows: results.length,
        data: results
      };
      
    } catch (error) {
      console.error('Upload error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Поиск результата для конкретного события

  fastify.post('/api/scout/find-result', async (request, reply) => {
    try {
      const { homeTeam, awayTeam, date, competition } = request.body;
      
      const matches = await findGameInDB(homeTeam, awayTeam, date, competition);
      
      return {
        success: true,
        searchInfo: {
          homeKeywords: extractSearchKeywords(homeTeam),
          awayKeywords: extractSearchKeywords(awayTeam)
        },
        matches: matches.map(m => ({
          id: m.id,
          sstatsId: m.sstats_id,
          date: m.date,
          homeTeam: m.home_team,
          awayTeam: m.away_team,
          homeScore: m.home_score,
          awayScore: m.away_score,
          score: (m.home_score !== null && m.away_score !== null) 
            ? `${m.home_score}:${m.away_score}` 
            : 'Ожидается',
          status: m.status,
          isFinished: m.is_finished || (m.home_score !== null && m.away_score !== null),
          league: m.league,
          matchScore: m.matchScore,
          teamsSwapped: m.teamsSwapped
        }))
      };
      
    } catch (error) {
      console.error('Find result error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Массовый поиск результатов (оптимизированный)
  fastify.post('/api/scout/find-results-batch', async (request, reply) => {
    try {
      const { events } = request.body;
      
      if (!events || !Array.isArray(events)) {
        return reply.code(400).send({ error: 'events array required' });
      }
      
      // Предзагрузка кэша один раз
      await loadTeamsCache();
      
      // Обрабатываем параллельно пачками по 10
      const BATCH_SIZE = 20;
      const results = [];
      
      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const batch = events.slice(i, i + BATCH_SIZE);
        
        const batchResults = await Promise.all(batch.map(async (event) => {
          try {
            const matches = await findGameInDB(
              event.homeTeam, 
              event.awayTeam, 
              event.date,
              event.competition
            );
            
            const bestMatch = matches[0];
            
            const hasScore = bestMatch && (bestMatch.home_score !== null && bestMatch.home_score !== undefined && bestMatch.away_score !== null && bestMatch.away_score !== undefined);
            const isFinished = bestMatch?.is_finished || hasScore;
            
            return {
              ...event,
              matchFound: !!bestMatch,
              dbMatch: bestMatch ? {
                id: bestMatch.id,
                sstatsId: bestMatch.sstats_id,
                homeTeam: bestMatch.home_team,
                awayTeam: bestMatch.away_team,
                homeScore: bestMatch.home_score,
                awayScore: bestMatch.away_score,
                score: hasScore 
                  ? `${bestMatch.home_score}:${bestMatch.away_score}` 
                  : 'Ожидается',
                isFinished: isFinished,
                league: bestMatch.league,
                matchScore: bestMatch.matchScore,
                teamsSwapped: bestMatch.teamsSwapped
              } : null
            };
          } catch (err) {
            return { ...event, matchFound: false, dbMatch: null, error: err.message };
          }
        }));
        
        results.push(...batchResults);
      }
      
      return {
        success: true,
        total: results.length,
        found: results.filter(r => r.matchFound).length,
        data: results
      };
      
    } catch (error) {
      console.error('Batch find error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Получить статистику
  fastify.get('/api/scout/stats', async (request, reply) => {
    try {
      const stats = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM games) as total_games,
          (SELECT COUNT(*) FROM games WHERE is_finished = true OR (home_score IS NOT NULL AND away_score IS NOT NULL)) as finished_games,
          (SELECT COUNT(*) FROM teams) as total_teams,
          (SELECT MIN(date)::date FROM games) as earliest_date,
          (SELECT MAX(date)::date FROM games) as latest_date
      `);
      
      return {
        success: true,
        stats: stats.rows[0],
        cacheInfo: {
          teamsLoaded: teamsCache.size,
          keywordsIndexed: teamsIndex.size
        }
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Поиск команды
  fastify.get('/api/scout/search-team', async (request, reply) => {
    try {
      const { q } = request.query;
      
      if (!q || q.length < 2) {
        return { teams: [] };
      }
      
      await loadTeamsCache();
      
      // Используем комбинированный поиск (keywords + trigrams)
      const candidates = findTeamsCombined(q);
      
      return { 
        teams: candidates.slice(0, 20).map(t => ({
          id: t.id,
          name: t.name,
          shortName: t.shortName,
          score: t.searchScore
        }))
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Перезагрузка кэша команд
  fastify.post('/api/scout/reload-cache', async (request, reply) => {
    try {
      cacheLoaded = false;
      await loadTeamsCache();
      
      return {
        success: true,
        teamsLoaded: teamsCache.size,
        keywordsIndexed: teamsIndex.size
      };
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // ==================== СОХРАНЕНИЕ В БД ====================
  
  // Сохранить загрузку и события в БД
  fastify.post('/api/scout/save-upload', async (request, reply) => {
    try {
      const { filename, events } = request.body;
      
      if (!events || !Array.isArray(events)) {
        return reply.code(400).send({ error: 'events array required' });
      }
      
      // Создаём запись загрузки
      const uploadResult = await pool.query(`
        INSERT INTO scout_uploads (filename, total_rows, football_rows, matched_rows)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `, [
        filename || 'upload.xlsx',
        events.length,
        events.length, // все события - футбол
        events.filter(e => e.matchFound).length
      ]);
      
      const uploadId = uploadResult.rows[0].id;
      
      // Сохраняем события
      for (const event of events) {
        await pool.query(`
          INSERT INTO scout_events (
            upload_batch_id, row_num, event_date, sport, competition, event_name,
            home_team_original, away_team_original, sources,
            matched_game_sstats_id, match_confidence, home_score, away_score,
            result_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          uploadId,
          event.rowNum,
          event.date,
          event.sport || 'Футбол',
          event.competition,
          event.eventName,
          event.homeTeam,
          event.awayTeam,
          event.sources,
          event.dbMatch?.sstatsId || null,
          event.dbMatch ? (event.dbMatch.matchScore / 100) : null,
          event.dbMatch?.homeScore ?? null,
          event.dbMatch?.awayScore ?? null,
          event.dbMatch?.isFinished ? 'finished' : 'pending'
        ]);
      }
      
      return {
        success: true,
        uploadId,
        savedEvents: events.length
      };
      
    } catch (error) {
      console.error('Save upload error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Получить список загрузок
  fastify.get('/api/scout/uploads', async (request, reply) => {
    try {
      const { limit = 50, offset = 0 } = request.query;
      
      const result = await pool.query(`
        SELECT 
          id,
          filename,
          created_at as upload_date,
          total_rows,
          football_rows,
          matched_rows,
          ROUND(matched_rows::numeric / NULLIF(football_rows, 0) * 100, 1) as match_rate
        FROM scout_uploads
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `, [parseInt(limit), parseInt(offset)]);
      
      const countResult = await pool.query('SELECT COUNT(*) FROM scout_uploads');
      
      return {
        success: true,
        uploads: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Получить события по загрузке
  fastify.get('/api/scout/uploads/:uploadId/events', async (request, reply) => {
    try {
      const { uploadId } = request.params;
      const { 
        limit = 100, 
        offset = 0,
        matchFound,
        competition,
        dateFrom,
        dateTo,
        betResult
      } = request.query;
      
      let whereConditions = ['upload_batch_id = $1'];
      let params = [uploadId];
      let paramIndex = 2;
      
      if (matchFound !== undefined) {
        whereConditions.push(`matched_game_sstats_id IS ${matchFound === 'true' ? 'NOT NULL' : 'NULL'}`);
      }
      
      if (competition) {
        whereConditions.push(`competition ILIKE $${paramIndex}`);
        params.push(`%${competition}%`);
        paramIndex++;
      }
      
      if (dateFrom) {
        whereConditions.push(`event_date >= $${paramIndex}`);
        params.push(dateFrom);
        paramIndex++;
      }
      
      if (dateTo) {
        whereConditions.push(`event_date <= $${paramIndex}`);
        params.push(dateTo);
        paramIndex++;
      }
      
      if (betResult) {
        whereConditions.push(`bet_result = $${paramIndex}`);
        params.push(betResult);
        paramIndex++;
      }
      
      const result = await pool.query(`
        SELECT *
        FROM scout_events
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY event_date DESC, row_num
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), parseInt(offset)]);
      
      const countResult = await pool.query(`
        SELECT COUNT(*) FROM scout_events WHERE ${whereConditions.join(' AND ')}
      `, params);
      
      return {
        success: true,
        events: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Получить все события с фильтрами (глобальный поиск)
  fastify.get('/api/scout/events', async (request, reply) => {
    try {
      const { 
        limit = 100, 
        offset = 0,
        matchFound,
        competition,
        dateFrom,
        dateTo,
        betResult,
        search
      } = request.query;
      
      let whereConditions = ['1=1'];
      let params = [];
      let paramIndex = 1;
      
      if (matchFound !== undefined) {
        whereConditions.push(`matched_game_sstats_id IS ${matchFound === 'true' ? 'NOT NULL' : 'NULL'}`);
      }
      
      if (competition) {
        whereConditions.push(`competition ILIKE $${paramIndex}`);
        params.push(`%${competition}%`);
        paramIndex++;
      }
      
      if (dateFrom) {
        whereConditions.push(`event_date >= $${paramIndex}`);
        params.push(dateFrom);
        paramIndex++;
      }
      
      if (dateTo) {
        whereConditions.push(`event_date <= $${paramIndex}`);
        params.push(dateTo);
        paramIndex++;
      }
      
      if (betResult) {
        whereConditions.push(`bet_result = $${paramIndex}`);
        params.push(betResult);
        paramIndex++;
      }
      
      if (search) {
        whereConditions.push(`(
          home_team_original ILIKE $${paramIndex} OR 
          away_team_original ILIKE $${paramIndex} OR
          competition ILIKE $${paramIndex}
        )`);
        params.push(`%${search}%`);
        paramIndex++;
      }
      
      const result = await pool.query(`
        SELECT 
          e.*,
          u.filename as upload_filename,
          u.created_at as upload_date,
    (SELECT json_agg(json_build_object('m',ge.minute,'x',ge.minute_extra,'h',(ge.team_id=g2.home_team_id)) ORDER BY ge.minute, COALESCE(ge.minute_extra,0)) FROM game_events ge JOIN games g2 ON ge.game_id=g2.id WHERE g2.sstats_id=e.matched_game_sstats_id AND ge.type='goal') AS goal_events
        FROM scout_events e
        LEFT JOIN scout_uploads u ON e.upload_batch_id = u.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY e.event_date DESC, e.row_num
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), parseInt(offset)]);
      
      const countResult = await pool.query(`
        SELECT COUNT(*) FROM scout_events WHERE ${whereConditions.join(' AND ')}
      `, params);
      
      // Статистика по фильтру
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(matched_game_sstats_id) as matched,
          COUNT(*) FILTER (WHERE bet_result = 'win') as wins,
          COUNT(*) FILTER (WHERE bet_result = 'lose') as losses,
          COALESCE(SUM(bet_amount), 0) as total_bets,
          COALESCE(SUM(CASE WHEN bet_result = 'win' THEN bet_amount * bet_odds - bet_amount ELSE 0 END), 0) as profit
        FROM scout_events
        WHERE ${whereConditions.join(' AND ')}
      `, params);
      
      return {
        success: true,
        events: result.rows,
        total: parseInt(countResult.rows[0].count),
        stats: statsResult.rows[0],
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Обновить событие (ставка, результат, заметки)
  fastify.put('/api/scout/events/:eventId', async (request, reply) => {
    try {
      const { eventId } = request.params;
      const { betAmount, betOdds, betResult, betType, betValue, notes } = request.body;
      
      const updates = [];
      const params = [];
      let paramIndex = 1;
      
      if (betAmount !== undefined) {
        updates.push(`bet_amount = $${paramIndex}`);
        params.push(betAmount);
        paramIndex++;
      }
      
      if (betOdds !== undefined) {
        updates.push(`bet_odds = $${paramIndex}`);
        params.push(betOdds);
        paramIndex++;
      }
      
      if (betResult !== undefined) {
        updates.push(`bet_result = $${paramIndex}`);
        params.push(betResult);
        paramIndex++;
      }
      
      if (betType !== undefined) {
        updates.push(`bet_type = $${paramIndex}`);
        params.push(betType);
        paramIndex++;
      }
      
      if (betValue !== undefined) {
        updates.push(`bet_value = $${paramIndex}`);
        params.push(betValue);
        paramIndex++;
      }
      
      if (notes !== undefined) {
        updates.push(`notes = $${paramIndex}`);
        params.push(notes);
        paramIndex++;
      }
      
      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }
      
      updates.push('updated_at = CURRENT_TIMESTAMP');
      
      const result = await pool.query(`
        UPDATE scout_events 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `, [...params, eventId]);
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Event not found' });
      }
      
      return {
        success: true,
        event: result.rows[0]
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Удалить загрузку и все её события
  fastify.delete('/api/scout/uploads/:uploadId', async (request, reply) => {
    try {
      const { uploadId } = request.params;
      
      // Удаляем события
      await pool.query('DELETE FROM scout_events WHERE upload_batch_id = $1', [uploadId]);
      
      // Удаляем загрузку
      const result = await pool.query(
        'DELETE FROM scout_uploads WHERE id = $1 RETURNING *',
        [uploadId]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Upload not found' });
      }
      
      return { success: true };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Получить уникальные соревнования для фильтра
  fastify.get('/api/scout/competitions', async (request, reply) => {
    try {
      const result = await pool.query(`
        SELECT DISTINCT competition, COUNT(*) as count
        FROM scout_events
        WHERE competition IS NOT NULL
        GROUP BY competition
        ORDER BY count DESC
        LIMIT 100
      `);
      
      return {
        success: true,
        competitions: result.rows
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Общая статистика по всем загрузкам
  fastify.get('/api/scout/summary', async (request, reply) => {
    try {
      const result = await pool.query(`
        SELECT 
          (SELECT COUNT(*) FROM scout_uploads) as total_uploads,
          (SELECT COUNT(*) FROM scout_events) as total_events,
          (SELECT COUNT(*) FROM scout_events WHERE matched_game_sstats_id IS NOT NULL) as matched_events,
          (SELECT COUNT(*) FROM scout_events WHERE bet_amount IS NOT NULL) as events_with_bets,
          (SELECT COALESCE(SUM(bet_amount), 0) FROM scout_events) as total_bet_amount,
          (SELECT COUNT(*) FROM scout_events WHERE bet_result = 'win') as wins,
          (SELECT COUNT(*) FROM scout_events WHERE bet_result = 'lose') as losses,
          (SELECT COALESCE(SUM(
            CASE 
              WHEN bet_result = 'win' THEN bet_amount * bet_odds - bet_amount
              WHEN bet_result = 'lose' THEN -bet_amount
              ELSE 0
            END
          ), 0) FROM scout_events) as total_profit
      `);
      
      return {
        success: true,
        summary: result.rows[0]
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // ==================== АВТОРИЗАЦИЯ ====================
  
  // Генерация случайного токена
  function generateToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
      token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
  }
  
  // Простая проверка пароля (для демо - без bcrypt)
  function checkPassword(inputPassword, storedHash) {
    // Для простоты: храним пароль как есть или простой хэш
    // В продакшене нужно использовать bcrypt
    return inputPassword === storedHash || storedHash.includes(inputPassword);
  }
  
  // Логин
  fastify.post('/api/scout/auth/login', async (request, reply) => {
    try {
      const { username, password } = request.body;
      
      if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password required' });
      }
      
      // Ищем пользователя
      const userResult = await pool.query(
        'SELECT * FROM scout_users WHERE username = $1 AND is_active = true',
        [username]
      );
      
      if (userResult.rows.length === 0) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }
      
      const user = userResult.rows[0];
      
      // Проверяем пароль
      // Для простых паролей (без bcrypt хэша)
      const isBcryptHash = user.password_hash.startsWith('$2');
      let passwordValid = false;
      
      if (isBcryptHash) {
        // Для bcrypt хэшей нужен bcrypt.compare - пока пропускаем
        // В продакшене: passwordValid = await bcrypt.compare(password, user.password_hash);
        passwordValid = false;
      } else {
        // Простое сравнение для нехэшированных паролей
        passwordValid = (user.password_hash === password);
      }
      
      if (!passwordValid) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }
      
      // Создаём сессию
      const token = generateToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 часа
      
      await pool.query(
        'INSERT INTO scout_sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
        [user.id, token, expiresAt]
      );
      
      // Обновляем last_login
      await pool.query(
        'UPDATE scout_users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
      
      return {
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          canSaveResults: user.can_save_results,
          canViewHistory: user.can_view_history,
          canEditEvents: user.can_edit_events,
          canManageUsers: user.can_manage_users
        }
      };
      
    } catch (error) {
      console.error('Login error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Проверка токена
  fastify.get('/api/scout/auth/check', async (request, reply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return { authenticated: false };
      }
      
      const result = await pool.query(`
        SELECT u.* FROM scout_users u
        JOIN scout_sessions s ON u.id = s.user_id
        WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active = true
      `, [token]);
      
      if (result.rows.length === 0) {
        return { authenticated: false };
      }
      
      const user = result.rows[0];
      
      return {
        authenticated: true,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          canSaveResults: user.can_save_results,
          canViewHistory: user.can_view_history,
          canEditEvents: user.can_edit_events,
          canManageUsers: user.can_manage_users
        }
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Выход
  fastify.post('/api/scout/auth/logout', async (request, reply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        await pool.query('DELETE FROM scout_sessions WHERE token = $1', [token]);
      }
      
      return { success: true };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Middleware для проверки авторизации
  async function checkAuth(request) {
    const token = request.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return null;
    }
    
    const result = await pool.query(`
      SELECT u.* FROM scout_users u
      JOIN scout_sessions s ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > NOW() AND u.is_active = true
    `, [token]);
    
    return result.rows[0] || null;
  }
  
  // Обновлённый save-upload с авторизацией
  fastify.post('/api/scout/save-upload-auth', async (request, reply) => {
    try {
      const user = await checkAuth(request);
      
      if (!user) {
        return reply.code(401).send({ error: 'Требуется авторизация' });
      }
      
      if (!user.can_save_results) {
        return reply.code(403).send({ error: 'Нет прав на сохранение результатов' });
      }
      
      const { filename, events } = request.body;
      
      if (!events || !Array.isArray(events)) {
        return reply.code(400).send({ error: 'events array required' });
      }
      
      // Создаём запись загрузки с user_id
      const uploadResult = await pool.query(`
        INSERT INTO scout_uploads (filename, total_rows, football_rows, matched_rows, user_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [
        filename || 'upload.xlsx',
        events.length,
        events.length,
        events.filter(e => e.matchFound).length,
        user.id
      ]);
      
      const uploadId = uploadResult.rows[0].id;
      
      // Сохраняем события
      for (const event of events) {
        await pool.query(`
          INSERT INTO scout_events (
            upload_batch_id, row_num, event_date, sport, competition, event_name,
            home_team_original, away_team_original, sources,
            matched_game_sstats_id, match_confidence, home_score, away_score,
            result_status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
          uploadId,
          event.rowNum,
          event.date,
          event.sport || 'Футбол',
          event.competition,
          event.eventName,
          event.homeTeam,
          event.awayTeam,
          event.sources,
          event.dbMatch?.sstatsId || null,
          event.dbMatch ? (event.dbMatch.matchScore / 100) : null,
          event.dbMatch?.homeScore ?? null,
          event.dbMatch?.awayScore ?? null,
          event.dbMatch?.isFinished ? 'finished' : 'pending'
        ]);
      }
      
      return {
        success: true,
        uploadId,
        savedEvents: events.length,
        savedBy: user.display_name || user.username
      };
      
    } catch (error) {
      console.error('Save upload error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // ==================== ИСТОЧНИКИ ====================
  
  // Получить список уникальных источников из БД
  fastify.get('/api/scout/sources', async (request, reply) => {
    try {
      const result = await pool.query(`
        SELECT DISTINCT unnest(string_to_array(sources, ',')) as source
        FROM scout_events
        WHERE sources IS NOT NULL AND sources != ''
      `);
      
      // Очищаем и подсчитываем
      const sourceCounts = {};
      
      const countResult = await pool.query(`
        SELECT sources, COUNT(*) as cnt
        FROM scout_events
        WHERE sources IS NOT NULL AND sources != ''
        GROUP BY sources
      `);
      
      countResult.rows.forEach(row => {
        const sources = row.sources.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
        sources.forEach(s => {
          sourceCounts[s] = (sourceCounts[s] || 0) + parseInt(row.cnt);
        });
      });
      
      return {
        success: true,
        sources: Object.entries(sourceCounts).map(([name, count]) => ({
          name,
          count
        })).sort((a, b) => b.count - a.count)
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Обновлённый /api/scout/events с фильтром по источникам
  fastify.get('/api/scout/events-v2', async (request, reply) => {
    try {
      const { 
        limit = 100, 
        offset = 0,
        matchFound,
        competition,
        dateFrom,
        dateTo,
        betResult,
        search,
        sources, // новый параметр - список источников через запятую (включение)
        excludeSources // новый параметр - список источников для исключения
      } = request.query;
      
      let whereConditions = ['1=1'];
      let params = [];
      let paramIndex = 1;
      
      if (matchFound !== undefined && matchFound !== '') {
        whereConditions.push(`matched_game_sstats_id IS ${matchFound === 'true' ? 'NOT NULL' : 'NULL'}`);
      }
      
      if (competition) {
        whereConditions.push(`competition ILIKE $${paramIndex}`);
        params.push(`%${competition}%`);
        paramIndex++;
      }
      
      if (dateFrom) {
        whereConditions.push(`event_date >= $${paramIndex}`);
        params.push(dateFrom);
        paramIndex++;
      }
      
      if (dateTo) {
        whereConditions.push(`event_date <= $${paramIndex}`);
        params.push(dateTo);
        paramIndex++;
      }
      
      if (betResult) {
        whereConditions.push(`bet_result = $${paramIndex}`);
        params.push(betResult);
        paramIndex++;
      }
      
      if (search) {
        whereConditions.push(`(
          home_team_original ILIKE $${paramIndex} OR 
          away_team_original ILIKE $${paramIndex} OR
          competition ILIKE $${paramIndex}
        )`);
        params.push(`%${search}%`);
        paramIndex++;
      }
      
      // Фильтр по источникам (включение)
      if (sources) {
        const sourceList = sources.split(',').map(s => s.trim()).filter(Boolean);
        if (sourceList.length > 0) {
          const sourceConditions = sourceList.map((_, i) => 
            `sources ILIKE $${paramIndex + i}`
          );
          whereConditions.push(`(${sourceConditions.join(' OR ')})`);
          sourceList.forEach(s => params.push(`%${s}%`));
          paramIndex += sourceList.length;
        }
      }
      
      // Фильтр по источникам (исключение) - жёсткий фильтр
      if (excludeSources) {
        const excludeList = excludeSources.split(',').map(s => s.trim()).filter(Boolean);
        if (excludeList.length > 0) {
          const excludeConditions = excludeList.map((_, i) => 
            `(sources IS NULL OR sources NOT ILIKE $${paramIndex + i})`
          );
          whereConditions.push(`(${excludeConditions.join(' AND ')})`);
          excludeList.forEach(s => params.push(`%${s}%`));
          paramIndex += excludeList.length;
        }
      }
      
      const result = await pool.query(`
        SELECT 
          e.*,
          u.filename as upload_filename,
          u.created_at as upload_date,
    (SELECT json_agg(json_build_object('m',ge.minute,'x',ge.minute_extra,'h',(ge.team_id=g2.home_team_id)) ORDER BY ge.minute, COALESCE(ge.minute_extra,0)) FROM game_events ge JOIN games g2 ON ge.game_id=g2.id WHERE g2.sstats_id=e.matched_game_sstats_id AND ge.type='goal') AS goal_events
        FROM scout_events e
        LEFT JOIN scout_uploads u ON e.upload_batch_id = u.id
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY e.event_date DESC, e.row_num
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, parseInt(limit), parseInt(offset)]);
      
      const countResult = await pool.query(`
        SELECT COUNT(*) FROM scout_events e WHERE ${whereConditions.join(' AND ')}
      `, params);
      
      // Статистика по фильтру
      const statsResult = await pool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(matched_game_sstats_id) as matched,
          COUNT(*) FILTER (WHERE home_score IS NOT NULL AND away_score IS NOT NULL) as with_score,
          COUNT(*) FILTER (WHERE result_status = 'finished') as finished,
          COUNT(*) FILTER (WHERE bet_result = 'win') as wins,
          COUNT(*) FILTER (WHERE bet_result = 'lose') as losses,
          COALESCE(SUM(bet_amount), 0) as total_bets,
          COALESCE(SUM(CASE WHEN bet_result = 'win' THEN bet_amount * bet_odds - bet_amount ELSE 0 END), 0) as profit
        FROM scout_events e
        WHERE ${whereConditions.join(' AND ')}
      `, params);
      
      return {
        success: true,
        events: result.rows,
        total: parseInt(countResult.rows[0].count),
        stats: statsResult.rows[0],
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
      
    } catch (error) {
      console.error('Events v2 error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // ==================== ПЕРЕСОПОСТАВЛЕНИЕ И ОБНОВЛЕНИЕ РЕЗУЛЬТАТОВ ====================
  
  /**
   * Пересопоставление событий — заново ищет матчи для всех/ненайденных событий
   * Использует улучшенный движок поиска (trigrams + phonetic index)
   */
  fastify.post('/api/scout/rematch', async (request, reply) => {
    try {
      const { uploadId, onlyUnmatched = true } = request.body || {};
      
      await loadTeamsCache();
      
      // Выбираем события для пересопоставления
      let whereClause = '1=1';
      const params = [];
      let paramIdx = 1;
      
      if (uploadId) {
        whereClause += ` AND upload_batch_id = $${paramIdx}`;
        params.push(uploadId);
        paramIdx++;
      }
      
      if (onlyUnmatched) {
        whereClause += ' AND matched_game_sstats_id IS NULL';
      }
      
      const eventsResult = await pool.query(`
        SELECT id, home_team_original, away_team_original, event_date, competition
        FROM scout_events
        WHERE ${whereClause}
        ORDER BY event_date
      `, params);
      
      const events = eventsResult.rows;
      console.log(`[Scout] Rematch: ${events.length} events to process`);
      
      let matched = 0;
      let updated = 0;
      let errors = 0;
      
      // Фаза 1: Собираем кандидатов на совпадение для каждого события
      const matchCandidates = []; // {eventId, best, event}
      
      const batchSize = 20;
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (event) => {
          try {
            const results = await findGameInDB(
              event.home_team_original,
              event.away_team_original,
              event.event_date,
              event.competition
            );
            
            if (results.length > 0) {
              const best = results[0];
              
              // Пропускаем матчи с низким качеством совпадения
              if (!best.matchDetails || (!best.matchDetails.bothTeamsNormal && !best.matchDetails.bothTeamsSwapped)) {
                return;
              }
              if (best.matchScore < 25) {
                return;
              }
              
              matchCandidates.push({ eventId: event.id, best, event });
            }
          } catch (err) {
            errors++;
            console.error(`[Scout] Rematch error for event ${event.id}:`, err.message);
          }
        }));
      }
      
      // Фаза 2: Дедупликация — каждая игра может быть сопоставлена только одному событию
      // Если несколько событий претендуют на одну игру, берём с наивысшим matchScore
      const gameToEvents = new Map(); // sstats_id -> {eventId, best, event}
      for (const candidate of matchCandidates) {
        const gameId = candidate.best.sstats_id;
        const existing = gameToEvents.get(gameId);
        if (!existing || candidate.best.matchScore > existing.best.matchScore) {
          gameToEvents.set(gameId, candidate);
        }
      }
      
      // Фаза 3: Применяем дедуплицированные совпадения
      const deduplicatedCandidates = new Set([...gameToEvents.values()].map(c => c.eventId));
      const skippedDupes = matchCandidates.length - deduplicatedCandidates.size;
      if (skippedDupes > 0) {
        console.log(`[Scout] Rematch dedup: ${skippedDupes} duplicate matches removed`);
      }
      
      for (const [gameId, candidate] of gameToEvents) {
        try {
          const best = candidate.best;
          matched++;
          
          const hasScore = best.home_score !== null && best.home_score !== undefined &&
                         best.away_score !== null && best.away_score !== undefined;
          
          await pool.query(`
            UPDATE scout_events SET
              matched_game_sstats_id = $1,
              match_confidence = $2,
              home_score = $3,
              away_score = $4,
              result_status = $5,
              updated_at = NOW()
            WHERE id = $6
          `, [
            best.sstats_id,
            best.matchScore ? (best.matchScore / 100) : null,
            hasScore ? best.home_score : null,
            hasScore ? best.away_score : null,
            best.is_finished ? 'finished' : 'pending',
            candidate.eventId
          ]);
          updated++;
        } catch (err) {
          errors++;
          console.error(`[Scout] Rematch update error:`, err.message);
        }
      }
      
      // Обновляем статистику загрузки
      if (uploadId) {
        await pool.query(`
          UPDATE scout_uploads SET 
            matched_rows = (SELECT COUNT(*) FROM scout_events WHERE upload_batch_id = $1 AND matched_game_sstats_id IS NOT NULL)
          WHERE id = $1
        `, [uploadId]);
      } else {
        // Обновляем все загрузки
        await pool.query(`
          UPDATE scout_uploads su SET 
            matched_rows = (SELECT COUNT(*) FROM scout_events WHERE upload_batch_id = su.id AND matched_game_sstats_id IS NOT NULL)
        `);
      }
      
      console.log(`[Scout] Rematch complete: ${matched} matched, ${updated} updated, ${errors} errors out of ${events.length}`);
      
      return {
        success: true,
        total: events.length,
        matched,
        updated,
        errors
      };
      
    } catch (error) {
      console.error('Rematch error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
  
  /**
   * Обновление счетов — берёт актуальные результаты из таблицы games
   * для всех событий, у которых есть matched_game_sstats_id
   */
  fastify.post('/api/scout/refresh-scores', async (request, reply) => {
    try {
      const { uploadId } = request.body || {};
      
      let whereClause = 'se.matched_game_sstats_id IS NOT NULL';
      const params = [];
      
      if (uploadId) {
        whereClause += ' AND se.upload_batch_id = $1';
        params.push(uploadId);
      }
      
      // Обновляем счета из таблицы games
      const updateResult = await pool.query(`
        UPDATE scout_events se SET
          home_score = g.home_score,
          away_score = g.away_score,
          result_status = CASE WHEN g.is_finished THEN 'finished' ELSE se.result_status END,
          updated_at = NOW()
        FROM games g
        WHERE g.sstats_id = se.matched_game_sstats_id
          AND ${whereClause}
          AND g.home_score IS NOT NULL
          AND (
            se.home_score IS DISTINCT FROM g.home_score
            OR se.away_score IS DISTINCT FROM g.away_score
            OR (g.is_finished AND se.result_status != 'finished')
          )
      `, params);
      
      const updatedCount = updateResult.rowCount;
      
      // Статистика
      const statsQuery = uploadId 
        ? `SELECT 
            COUNT(*) as total,
            COUNT(matched_game_sstats_id) as matched,
            COUNT(CASE WHEN home_score IS NOT NULL THEN 1 END) as with_score,
            COUNT(CASE WHEN result_status = 'finished' THEN 1 END) as finished
           FROM scout_events WHERE upload_batch_id = $1`
        : `SELECT 
            COUNT(*) as total,
            COUNT(matched_game_sstats_id) as matched,
            COUNT(CASE WHEN home_score IS NOT NULL THEN 1 END) as with_score,
            COUNT(CASE WHEN result_status = 'finished' THEN 1 END) as finished
           FROM scout_events`;
      
      const stats = await pool.query(statsQuery, uploadId ? [uploadId] : []);
      
      console.log(`[Scout] Refresh scores: ${updatedCount} events updated`);
      
      return {
        success: true,
        updated: updatedCount,
        stats: stats.rows[0]
      };
      
    } catch (error) {
      console.error('Refresh scores error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // ==================== АВТОМАТИЧЕСКОЕ ОБНОВЛЕНИЕ СЧЕТОВ ====================
  
  /**
   * Автоматическое обновление счетов каждые 30 минут
   * Обновляет scout_events из таблицы games для завершённых матчей
   */
  async function autoRefreshScores() {
    try {
      const updateResult = await pool.query(`
        UPDATE scout_events se SET
          home_score = g.home_score,
          away_score = g.away_score,
          result_status = CASE WHEN g.is_finished THEN 'finished' ELSE se.result_status END,
          updated_at = NOW()
        FROM games g
        WHERE g.sstats_id = se.matched_game_sstats_id
          AND se.matched_game_sstats_id IS NOT NULL
          AND g.home_score IS NOT NULL
          AND (
            se.home_score IS DISTINCT FROM g.home_score
            OR se.away_score IS DISTINCT FROM g.away_score
            OR (g.is_finished AND se.result_status != 'finished')
          )
      `);
      
      if (updateResult.rowCount > 0) {
        console.log(`[Scout] Auto-refresh: updated ${updateResult.rowCount} event scores`);
      }
    } catch (error) {
      console.error('[Scout] Auto-refresh scores error:', error.message);
    }
  }
  
  // Запускаем автообновление каждые 30 минут
  const AUTO_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 минут
  setInterval(autoRefreshScores, AUTO_REFRESH_INTERVAL);
  
  // Первое обновление через 60 секунд после старта
  setTimeout(autoRefreshScores, 60 * 1000);
  
  console.log('[Scout] Auto-refresh scores scheduled every 30 minutes');

  // ==================== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ====================
  
  // Создать пользователя (только для админов)
  fastify.post('/api/scout/users', async (request, reply) => {
    try {
      const admin = await checkAuth(request);
      
      if (!admin || !admin.can_manage_users) {
        return reply.code(403).send({ error: 'Нет прав на управление пользователями' });
      }
      
      const { username, password, displayName, email, canSaveResults, canEditEvents, canViewHistory } = request.body;
      
      if (!username || !password) {
        return reply.code(400).send({ error: 'Username and password required' });
      }
      
      const result = await pool.query(`
        INSERT INTO scout_users (username, password_hash, display_name, email, can_save_results, can_edit_events, can_view_history)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, username, display_name, can_save_results, can_edit_events, can_view_history
      `, [
        username,
        password, // В продакшене: await bcrypt.hash(password, 10)
        displayName || username,
        email,
        canSaveResults || false,
        canEditEvents || false,
        canViewHistory !== false
      ]);
      
      return {
        success: true,
        user: result.rows[0]
      };
      
    } catch (error) {
      if (error.code === '23505') {
        return reply.code(400).send({ error: 'Пользователь с таким именем уже существует' });
      }
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Список пользователей (только для админов)
  fastify.get('/api/scout/users', async (request, reply) => {
    try {
      const admin = await checkAuth(request);
      
      if (!admin || !admin.can_manage_users) {
        return reply.code(403).send({ error: 'Нет прав на управление пользователями' });
      }
      
      const result = await pool.query(`
        SELECT id, username, display_name, email, is_active, 
               can_save_results, can_view_history, can_edit_events, can_manage_users,
               created_at, last_login
        FROM scout_users
        ORDER BY created_at DESC
      `);
      
      return {
        success: true,
        users: result.rows
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Тестирование входа пользователя (только для админов)
  fastify.post('/api/scout/users/:userId/test-login', async (request, reply) => {
    try {
      const admin = await checkAuth(request);
      
      if (!admin || !admin.can_manage_users) {
        return reply.code(403).send({ error: 'Нет прав на управление пользователями' });
      }
      
      const { userId } = request.params;
      const { password } = request.body;
      
      // Получаем пользователя
      const userResult = await pool.query(
        'SELECT * FROM scout_users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }
      
      const user = userResult.rows[0];
      
      // Проверяем пароль
      const isBcryptHash = user.password_hash.startsWith('$2');
      let passwordValid = false;
      
      if (isBcryptHash) {
        passwordValid = false; // bcrypt не поддерживается в простом режиме
      } else {
        passwordValid = (user.password_hash === password);
      }
      
      return {
        success: true,
        loginTest: {
          userId: user.id,
          username: user.username,
          passwordValid,
          isActive: user.is_active,
          canLogin: passwordValid && user.is_active,
          message: passwordValid 
            ? (user.is_active ? '✅ Вход успешен - учётные данные верны' : '⚠️ Пароль верный, но аккаунт деактивирован')
            : '❌ Неверный пароль'
        }
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Обновить пользователя (только для админов)
  fastify.put('/api/scout/users/:userId', async (request, reply) => {
    try {
      const admin = await checkAuth(request);
      
      if (!admin || !admin.can_manage_users) {
        return reply.code(403).send({ error: 'Нет прав на управление пользователями' });
      }
      
      const { userId } = request.params;
      const { password, displayName, email, isActive, canSaveResults, canEditEvents, canViewHistory } = request.body;
      
      const updates = [];
      const params = [];
      let paramIndex = 1;
      
      if (password !== undefined && password !== '') {
        updates.push(`password_hash = $${paramIndex}`);
        params.push(password); // В продакшене: await bcrypt.hash(password, 10)
        paramIndex++;
      }
      
      if (displayName !== undefined) {
        updates.push(`display_name = $${paramIndex}`);
        params.push(displayName);
        paramIndex++;
      }
      
      if (email !== undefined) {
        updates.push(`email = $${paramIndex}`);
        params.push(email);
        paramIndex++;
      }
      
      if (isActive !== undefined) {
        updates.push(`is_active = $${paramIndex}`);
        params.push(isActive);
        paramIndex++;
      }
      
      if (canSaveResults !== undefined) {
        updates.push(`can_save_results = $${paramIndex}`);
        params.push(canSaveResults);
        paramIndex++;
      }
      
      if (canEditEvents !== undefined) {
        updates.push(`can_edit_events = $${paramIndex}`);
        params.push(canEditEvents);
        paramIndex++;
      }
      
      if (canViewHistory !== undefined) {
        updates.push(`can_view_history = $${paramIndex}`);
        params.push(canViewHistory);
        paramIndex++;
      }
      
      if (updates.length === 0) {
        return reply.code(400).send({ error: 'No fields to update' });
      }
      
      const result = await pool.query(`
        UPDATE scout_users 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING id, username, display_name, email, is_active, can_save_results, can_edit_events, can_view_history
      `, [...params, userId]);
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }
      
      return {
        success: true,
        user: result.rows[0]
      };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });
  
  // Удалить пользователя (только для админов)
  fastify.delete('/api/scout/users/:userId', async (request, reply) => {
    try {
      const admin = await checkAuth(request);
      
      if (!admin || !admin.can_manage_users) {
        return reply.code(403).send({ error: 'Нет прав на управление пользователями' });
      }
      
      const { userId } = request.params;
      
      // Нельзя удалить себя
      if (parseInt(userId) === admin.id) {
        return reply.code(400).send({ error: 'Нельзя удалить свой аккаунт' });
      }
      
      // Удаляем сессии
      await pool.query('DELETE FROM scout_sessions WHERE user_id = $1', [userId]);
      
      // Удаляем пользователя
      const result = await pool.query(
        'DELETE FROM scout_users WHERE id = $1 RETURNING *',
        [userId]
      );
      
      if (result.rows.length === 0) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }
      
      return { success: true };
      
    } catch (error) {
      return reply.code(500).send({ error: error.message });
    }
  });  // ================== BACKFILL ГОЛЕВЫХ СОБЫТИЙ ====================
  fastify.post('/api/scout/backfill-events', async (request, reply) => {
    try {
      const { limit = 20 } = request.body || {};
      const DataLoader = require('../../loader/data-loader');
      const toFill = await pool.query(`
        SELECT DISTINCT se.matched_game_sstats_id AS sstats_id
        FROM scout_events se
        WHERE se.matched_game_sstats_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM game_events ge
            JOIN games g ON ge.game_id = g.id
            WHERE g.sstats_id = se.matched_game_sstats_id AND ge.type = 'goal'
          )
        LIMIT $1`, [Math.min(parseInt(limit) || 20, 50)]);
      const ids = toFill.rows.map(r => r.sstats_id);
      let loaded = 0, failed = 0;
      for (const sstatsId of ids) {
        try {
          const loader = new DataLoader();
          await loader.load('game_details', { gameId: sstatsId });
          loaded++;
          await new Promise(r => setTimeout(r, 400));
        } catch (err) {
          console.error('[Scout] Backfill failed for', sstatsId, err.message);
          failed++;
        }
      }
      const rem = await pool.query(`
        SELECT COUNT(DISTINCT se.matched_game_sstats_id) AS cnt
        FROM scout_events se
        WHERE se.matched_game_sstats_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM game_events ge
            JOIN games g ON ge.game_id=g.id
            WHERE g.sstats_id=se.matched_game_sstats_id AND ge.type='goal'
          )
      `);
      return { success:true, processed:ids.length, loaded, failed, remaining:parseInt(rem.rows[0].cnt) };
    } catch (error) {
      console.error('[Scout] Backfill error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });
}
module.exports = scoutRoutes;
