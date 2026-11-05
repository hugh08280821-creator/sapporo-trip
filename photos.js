// 포토스팟 대표 사진: 위키미디어 공용의 자유 이용 사진 (작가·라이선스 표시)
const PHOTO_IMGS = {
  "photo_clock_tower_front": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/42/Sapporo-Clock-Tower-2018.jpg/960px-Sapporo-Clock-Tower-2018.jpg",
    "w": 960,
    "h": 819,
    "file": "https://commons.wikimedia.org/wiki/File:Sapporo-Clock-Tower-2018.jpg",
    "author": "Bjørn Christian Tørrissen",
    "license": "CC BY-SA 4.0",
    "what": "시계탑 정면, 낮"
  },
  "photo_tvtower_deck_west": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/b/b2/Sapporo_White_Illumination_2016_%28184517323%29.jpeg/960px-Sapporo_White_Illumination_2016_%28184517323%29.jpeg",
    "w": 960,
    "h": 1280,
    "file": "https://commons.wikimedia.org/wiki/File:Sapporo_White_Illumination_2016_(184517323).jpeg",
    "author": "Sorah Fukumori",
    "license": "CC BY 3.0",
    "what": "전망대에서 본 일루미네이션"
  },
  "photo_odori_w3_tvtower": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/68/%E5%A4%A7%E9%80%9A%E5%85%AC%E5%9C%92%E3%82%A4%E3%83%AB%E3%83%9F%E3%83%8D%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3%EF%BC%88Odori_Park_at_night%EF%BC%89_-_panoramio.jpg/960px-%E5%A4%A7%E9%80%9A%E5%85%AC%E5%9C%92%E3%82%A4%E3%83%AB%E3%83%9F%E3%83%8D%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3%EF%BC%88Odori_Park_at_night%EF%BC%89_-_panoramio.jpg",
    "w": 960,
    "h": 720,
    "file": "https://commons.wikimedia.org/wiki/File:%E5%A4%A7%E9%80%9A%E5%85%AC%E5%9C%92%E3%82%A4%E3%83%AB%E3%83%9F%E3%83%8D%E3%83%BC%E3%82%B7%E3%83%A7%E3%83%B3%EF%BC%88Odori_Park_at_night%EF%BC%89_-_panoramio.jpg",
    "author": "popsaurus",
    "license": "CC BY 3.0",
    "what": "오도리 공원 일루미네이션과 TV 타워"
  },
  "photo_munich_market": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/46/%E3%83%9F%E3%83%A5%E3%83%B3%E3%83%98%E3%83%B3%E3%83%BB%E3%82%AF%E3%83%AA%E3%82%B9%E3%83%9E%E3%82%B9%E5%B8%82_in_Sapporo%EF%BC%88Munich_Christmas_in_Sapporo_City%EF%BC%89_-_panoramio_%281%29.jpg/960px-%E3%83%9F%E3%83%A5%E3%83%B3%E3%83%98%E3%83%B3%E3%83%BB%E3%82%AF%E3%83%AA%E3%82%B9%E3%83%9E%E3%82%B9%E5%B8%82_in_Sapporo%EF%BC%88Munich_Christmas_in_Sapporo_City%EF%BC%89_-_panoramio_%281%29.jpg",
    "w": 960,
    "h": 640,
    "file": "https://commons.wikimedia.org/wiki/File:%E3%83%9F%E3%83%A5%E3%83%B3%E3%83%98%E3%83%B3%E3%83%BB%E3%82%AF%E3%83%AA%E3%82%B9%E3%83%9E%E3%82%B9%E5%B8%82_in_Sapporo%EF%BC%88Munich_Christmas_in_Sapporo_City%EF%BC%89_-_panoramio_(1).jpg",
    "author": "t-konno",
    "license": "CC BY-SA 3.0",
    "what": "크리스마스 시장과 TV 타워, 밤"
  },
  "photo_akapla_akarenga": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8e/Former_Hokkaid%C5%8D_Government_Office_seen_from_Kita_3-jo_plaza.jpg/960px-Former_Hokkaid%C5%8D_Government_Office_seen_from_Kita_3-jo_plaza.jpg",
    "w": 960,
    "h": 640,
    "file": "https://commons.wikimedia.org/wiki/File:Former_Hokkaid%C5%8D_Government_Office_seen_from_Kita_3-jo_plaza.jpg",
    "author": "掬茶",
    "license": "CC BY-SA 4.0",
    "what": "아카프라 가로수 끝 청사, 낮"
  },
  "photo_t38_night": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/01/Night_cityscape_from_JR_Tower_%28south_side%29.jpg/960px-Night_cityscape_from_JR_Tower_%28south_side%29.jpg",
    "w": 960,
    "h": 540,
    "file": "https://commons.wikimedia.org/wiki/File:Night_cityscape_from_JR_Tower_(south_side).jpg",
    "author": "掬茶",
    "license": "CC BY-SA 4.0",
    "what": "T38 남쪽 창 야경"
  },
  "photo_sapporo_station_south": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Sapporo_Station_at_night_202507.jpg/960px-Sapporo_Station_at_night_202507.jpg",
    "w": 960,
    "h": 640,
    "file": "https://commons.wikimedia.org/wiki/File:Sapporo_Station_at_night_202507.jpg",
    "author": "掬茶",
    "license": "CC BY-SA 4.0",
    "what": "삿포로역 남쪽 광장과 JR 타워, 밤"
  },
  "photo_susukino_nikka": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/18/Susukino%2C_Sapporo_at_night_on_July_17th%2C_2018.jpg/960px-Susukino%2C_Sapporo_at_night_on_July_17th%2C_2018.jpg",
    "w": 960,
    "h": 720,
    "file": "https://commons.wikimedia.org/wiki/File:Susukino,_Sapporo_at_night_on_July_17th,_2018.jpg",
    "author": "Choi2451",
    "license": "CC BY-SA 4.0",
    "what": "스스키노 니카 간판, 밤 (2018년 모습)"
  },
  "photo_moiwa_bell": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fd/City_nightscape_of_Sapporo_from_Mt._Moiwa_20260703a.jpg/960px-City_nightscape_of_Sapporo_from_Mt._Moiwa_20260703a.jpg",
    "w": 960,
    "h": 540,
    "file": "https://commons.wikimedia.org/wiki/File:City_nightscape_of_Sapporo_from_Mt._Moiwa_20260703a.jpg",
    "author": "掬茶",
    "license": "CC BY-SA 4.0",
    "what": "모이와산 정상 야경"
  },
  "photo_hoheikan_front": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/69/Hoheikan-Sapporo-2018.jpg/960px-Hoheikan-Sapporo-2018.jpg",
    "w": 960,
    "h": 630,
    "file": "https://commons.wikimedia.org/wiki/File:Hoheikan-Sapporo-2018.jpg",
    "author": "Bjørn Christian Tørrissen",
    "license": "CC BY-SA 4.0",
    "what": "호헤이칸 정면, 낮"
  },
  "photo_hokudai_clark": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/3/36/131103_Hokkaido_University_Sapporo_Hokkaido_Japan08bs.jpg/960px-131103_Hokkaido_University_Sapporo_Hokkaido_Japan08bs.jpg",
    "w": 960,
    "h": 1445,
    "file": "https://commons.wikimedia.org/wiki/File:131103_Hokkaido_University_Sapporo_Hokkaido_Japan08bs.jpg",
    "author": "663highland",
    "license": "CC BY 2.5",
    "what": "클라크 박사 흉상, 단풍철"
  },
  "photo_hokudai_poplar": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/60/Poplar_avenue_at_Hokkaido_University_02.jpg/960px-Poplar_avenue_at_Hokkaido_University_02.jpg",
    "w": 960,
    "h": 1280,
    "file": "https://commons.wikimedia.org/wiki/File:Poplar_avenue_at_Hokkaido_University_02.jpg",
    "author": "ノボホショコロトソ",
    "license": "CC BY 4.0",
    "what": "포플러 가로수길, 11월 초"
  },
  "photo_jingu_shinmon": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/86/Hokkaido_Shrine_%2853572128%29.jpeg/960px-Hokkaido_Shrine_%2853572128%29.jpeg",
    "w": 960,
    "h": 640,
    "file": "https://commons.wikimedia.org/wiki/File:Hokkaido_Shrine_(53572128).jpeg",
    "author": "Hideshi Tsunematsu",
    "license": "CC BY 3.0",
    "what": "홋카이도 신궁 신문, 눈 오는 날"
  },
  "photo_asahiyama_night": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/45/%E6%97%AD%E5%B1%B1%E8%A8%98%E5%BF%B5%E5%85%AC%E5%9C%92%EF%BC%88Asahiyama_memorial_park%EF%BC%89_-_panoramio.jpg/960px-%E6%97%AD%E5%B1%B1%E8%A8%98%E5%BF%B5%E5%85%AC%E5%9C%92%EF%BC%88Asahiyama_memorial_park%EF%BC%89_-_panoramio.jpg",
    "w": 960,
    "h": 640,
    "file": "https://commons.wikimedia.org/wiki/File:%E6%97%AD%E5%B1%B1%E8%A8%98%E5%BF%B5%E5%85%AC%E5%9C%92%EF%BC%88Asahiyama_memorial_park%EF%BC%89_-_panoramio.jpg",
    "author": "t-konno",
    "license": "CC BY-SA 3.0",
    "what": "아사히야마 공원 전망 광장 야경"
  },
  "photo_shiroi_clock": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/49/%E7%99%BD%E4%B9%8B%E6%88%80%E4%BA%BA%E9%90%98%E6%A8%93_-_panoramio.jpg/960px-%E7%99%BD%E4%B9%8B%E6%88%80%E4%BA%BA%E9%90%98%E6%A8%93_-_panoramio.jpg",
    "w": 960,
    "h": 1434,
    "file": "https://commons.wikimedia.org/wiki/File:%E7%99%BD%E4%B9%8B%E6%88%80%E4%BA%BA%E9%90%98%E6%A8%93_-_panoramio.jpg",
    "author": "chiyuen",
    "license": "CC BY-SA 3.0",
    "what": "시로이 코이비토 파크 시계탑, 여름"
  },
  "photo_otaru_asakusabashi": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/4/46/Otaru_Canal_Night.jpg/960px-Otaru_Canal_Night.jpg",
    "w": 960,
    "h": 640,
    "file": "https://commons.wikimedia.org/wiki/File:Otaru_Canal_Night.jpg",
    "author": "Haha169",
    "license": "CC BY-SA 4.0",
    "what": "겨울밤 오타루 운하"
  },
  "photo_otaru_chuobashi": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/0d/Otaru_-_Otaru181.jpg/960px-Otaru_-_Otaru181.jpg",
    "w": 960,
    "h": 640,
    "file": "https://commons.wikimedia.org/wiki/File:Otaru_-_Otaru181.jpg",
    "author": "lumoplank",
    "license": "CC0",
    "what": "해 질 녘 운하와 창고"
  },
  "photo_otaru_kitaunga": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/09/%E5%B0%8F%E6%A8%BD%E9%81%8B%E6%B2%B3_-_panoramio_%288%29.jpg/960px-%E5%B0%8F%E6%A8%BD%E9%81%8B%E6%B2%B3_-_panoramio_%288%29.jpg",
    "w": 960,
    "h": 640,
    "file": "https://commons.wikimedia.org/wiki/File:%E5%B0%8F%E6%A8%BD%E9%81%8B%E6%B2%B3_-_panoramio_(8).jpg",
    "author": "くろふね",
    "license": "CC BY 3.0",
    "what": "북운하 옛 창고와 수면"
  },
  "photo_otaru_funamizaka": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/23/Funamizaka_31499166415_d62859617d_o.jpg/960px-Funamizaka_31499166415_d62859617d_o.jpg",
    "w": 960,
    "h": 636,
    "file": "https://commons.wikimedia.org/wiki/File:Funamizaka_31499166415_d62859617d_o.jpg",
    "author": "Toomore Chiang",
    "license": "CC BY 2.0",
    "what": "눈 덮인 후나미자카"
  },
  "photo_otaru_steam_clock": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/2/2e/The_Otaru_Steam_Clock_%E6%99%82%E8%A8%88_on_the_Marchen_Intersection_in_Otaru_Hokkaido_Japan_%283887460608%29.jpg/960px-The_Otaru_Steam_Clock_%E6%99%82%E8%A8%88_on_the_Marchen_Intersection_in_Otaru_Hokkaido_Japan_%283887460608%29.jpg",
    "w": 960,
    "h": 1280,
    "file": "https://commons.wikimedia.org/wiki/File:The_Otaru_Steam_Clock_%E6%99%82%E8%A8%88_on_the_Marchen_Intersection_in_Otaru_Hokkaido_Japan_(3887460608).jpg",
    "author": "Arjan Richter",
    "license": "CC BY 2.0",
    "what": "오르골당 앞 증기 시계"
  },
  "photo_otaru_kitaichi_hall": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/1/1a/%E5%8C%97%E4%B8%80%E3%83%9B%E3%83%BC%E3%83%AB_2014.jpg/960px-%E5%8C%97%E4%B8%80%E3%83%9B%E3%83%BC%E3%83%AB_2014.jpg",
    "w": 960,
    "h": 720,
    "file": "https://commons.wikimedia.org/wiki/File:%E5%8C%97%E4%B8%80%E3%83%9B%E3%83%BC%E3%83%AB_2014.jpg",
    "author": "Wpcpey",
    "license": "CC BY 4.0",
    "what": "기타이치 홀 석유 램프"
  },
  "photo_otaru_irouchi_bank": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/8/86/130823_Bank_of_Japan_Otaru_Museum02s4.jpg/960px-130823_Bank_of_Japan_Otaru_Museum02s4.jpg",
    "w": 960,
    "h": 638,
    "file": "https://commons.wikimedia.org/wiki/File:130823_Bank_of_Japan_Otaru_Museum02s4.jpg",
    "author": "663highland",
    "license": "CC BY 2.5",
    "what": "옛 일본은행 오타루지점"
  },
  "photo_otaru_station_lamps": {
    "img": "https://upload.wikimedia.org/wikipedia/commons/5/58/Lamps_in_Otaru-Station.jpg",
    "w": 960,
    "h": 642,
    "file": "https://commons.wikimedia.org/wiki/File:Lamps_in_Otaru-Station.jpg",
    "author": "snow rabbit (yukifuri hoshimi)",
    "license": "CC BY-SA 2.0",
    "what": "오타루역 유리 램프"
  },
  "photo_otaru_temiya": {
    "img": "https://thumb.wikimedia.org/wikipedia/commons/thumb/0/00/%E6%89%8B%E5%AE%AE%E7%B7%9A%E8%B7%A1_Former_Temiya_Line%2C_Otaru_-_Aug_17%2C_2009.jpg/960px-%E6%89%8B%E5%AE%AE%E7%B7%9A%E8%B7%A1_Former_Temiya_Line%2C_Otaru_-_Aug_17%2C_2009.jpg",
    "w": 960,
    "h": 1280,
    "file": "https://commons.wikimedia.org/wiki/File:%E6%89%8B%E5%AE%AE%E7%B7%9A%E8%B7%A1_Former_Temiya_Line,_Otaru_-_Aug_17,_2009.jpg",
    "author": "dreamcat115",
    "license": "CC BY-SA 2.0",
    "what": "옛 데미야선 레일"
  }
};
PLACES.forEach((p) => { if (PHOTO_IMGS[p.id]) p.photo = PHOTO_IMGS[p.id]; });
