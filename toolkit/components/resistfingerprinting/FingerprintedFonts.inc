/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const char* fpjs[] = {"sans-serif-thin",
                      "ARNO PRO",
                      "Agency FB",
                      "Arabic Typesetting",
                      "Arial Unicode MS",
                      "AvantGarde Bk BT",
                      "BankGothic Md BT",
                      "Batang",
                      "Bitstream Vera Sans Mono",
                      "Calibri",
                      "Century",
                      "Century Gothic",
                      "Clarendon",
                      "EUROSTILE",
                      "Franklin Gothic",
                      "Futura Bk BT",
                      "Futura Md BT",
                      "GOTHAM",
                      "Gill Sans",
                      "HELV",
                      "Haettenschweiler",
                      "Helvetica Neue",
                      "Humanst521 BT",
                      "Leelawadee",
                      "Letter Gothic",
                      "Levenim MT",
                      "Lucida Bright",
                      "Lucida Sans",
                      "Menlo",
                      "MS Mincho",
                      "MS Outlook",
                      "MS Reference Specialty",
                      "MS UI Gothic",
                      "MT Extra",
                      "MYRIAD PRO",
                      "Marlett",
                      "Meiryo UI",
                      "Microsoft Uighur",
                      "Minion Pro",
                      "Monotype Corsiva",
                      "PMingLiU",
                      "Pristina",
                      "SCRIPTINA",
                      "Segoe UI Light",
                      "Serifa",
                      "SimHei",
                      "Small Fonts",
                      "Staccato222 BT",
                      "TRAJAN PRO",
                      "Univers CE 55 Medium",
                      "Vrinda",
                      "ZWAdobeF",
                      nullptr};
const char* variantA[] = {"ms pmincho",
                          "antique olive",
                          "arial hebrew",
                          "party let",
                          "incised901 bt",
                          "princetown let",
                          "signboard",
                          "denmark",
                          "microsoft yi baiti",
                          "marigold",
                          "forte",
                          "juice itc",
                          "santa fe let",
                          "palatino linotype",
                          "vladimir script",
                          "storybook",
                          "old century",
                          "courier",
                          "adobe garamond pro",
                          "arabic typesetting",
                          "cordia new",
                          "mona lisa solid itc tt",
                          "didot",
                          "constantia",
                          "bell mt",
                          "bembo",
                          "charter bd bt",
                          "caslonopnface bt",
                          "gill sans ultra bold",
                          "miriam",
                          "pmingliu-extb",
                          "teletype",
                          "unicorn",
                          "avantgarde bk bt",
                          "rockwell",
                          "zapfhumnst dm bt",
                          "showcard gothic",
                          "snap itc",
                          "cambria math",
                          "matura mt script capitals",
                          "bradley hand",
                          "pegasus",
                          "ptbarnum bt",
                          "berlin sans fb",
                          "galliard bt",
                          "binnerd",
                          "gill sans ultra bold condensed",
                          "lucida bright",
                          "high tower text",
                          "calligrapher",
                          "chalkboard se",
                          "cloisterblack bt",
                          "batangche",
                          "cornerstone",
                          "niagara engraved",
                          "herald",
                          "kodchiangupc",
                          "times new roman",
                          "whitney",
                          "sakkal majalla",
                          "amertype md bt",
                          "fixedsys",
                          "zurich ex bt",
                          "times new roman ps",
                          "goudy old style",
                          "century",
                          "eras demi itc",
                          "dotum",
                          "old english text mt",
                          "apple sd gothic neo",
                          "geometr231 bt",
                          "lucida console",
                          "futura md bt",
                          "arno pro",
                          "kristen itc",
                          "socket",
                          "heather",
                          "hiragino mincho pron",
                          "copperplgoth bd bt",
                          "bradley hand itc",
                          "rockwell condensed",
                          "adobe garamond",
                          "ms serif",
                          "gotham bold",
                          "small fonts",
                          "chalkduster",
                          "ocr a extended",
                          "book antiqua",
                          "sherwood",
                          "bernhardfashion bt",
                          "technical",
                          "lucida sans unicode",
                          "futura bk bt",
                          "kailasa",
                          "onyx",
                          "jenson",
                          "imprint mt shadow",
                          "meiryo ui",
                          "incised901 lt bt",
                          "simhei",
                          "arial",
                          "serifa bt",
                          "apple chancery",
                          "script mt bold",
                          "vrinda",
                          "lithograph",
                          "coronet",
                          "swiss911 xcm bt",
                          "monaco",
                          "bodoni mt black",
                          "cuckoo",
                          "bodoni 72 oldstyle",
                          "jokerman",
                          "univers condensed",
                          "zapfhumnst bt",
                          "visualui",
                          "microsoft sans serif",
                          "berlin sans fb demi",
                          "comic sans ms",
                          "georgia",
                          "kaufmann bt",
                          "minion pro",
                          "benguiat bk bt",
                          "long island",
                          "hoefler text",
                          "khmer ui",
                          "modern",
                          "american typewriter condensed",
                          "lydian bt",
                          "agency fb",
                          "savoye let",
                          "inconsolata",
                          "eras bold itc",
                          "delicious",
                          "playbill",
                          "shruti",
                          "zapfino",
                          "engraversgothic bt",
                          "vagabond",
                          "ebrima",
                          "geometr231 lt bt",
                          "castellar",
                          "optima",
                          "tamil sangam mn",
                          "magneto",
                          "segoe ui light",
                          "gungsuh",
                          "palatino",
                          "chiller",
                          "gautami",
                          "niagara solid",
                          "mongolian baiti",
                          "gill sans mt condensed",
                          "levenim mt",
                          "ravie",
                          "angsana new",
                          "albertus extra bold",
                          "lucida sans typewriter",
                          "daunpenh",
                          "exotc350 bd bt",
                          "segoe ui",
                          "britannic bold",
                          "brush script mt",
                          "gill sans mt",
                          "bank gothic",
                          "dfkai-sb",
                          "monotype corsiva",
                          "moolboran",
                          "lucida sans",
                          "incised901 bd bt",
                          "andale mono",
                          "browalliaupc",
                          "oriya sangam mn",
                          "dilleniaupc",
                          "impact",
                          "aharoni",
                          "bauhaus 93",
                          "onyx bt",
                          "albertus medium",
                          "amazone bt",
                          "bodoni 72 smallcaps",
                          "mt extra",
                          "sylfaen",
                          "gisha",
                          "iskoola pota",
                          "bauer bodoni",
                          "bazooka",
                          "ms pgothic",
                          "century gothic",
                          "chalkboard",
                          "ribbon131 bd bt",
                          "korinna bt",
                          "humanst521 bt",
                          "baskerville",
                          "kunstler script",
                          "shelleyvolante bt",
                          "ms mincho",
                          "raavi",
                          "geoslab 703 xbd bt",
                          "arrus bt",
                          "rockwell extra bold",
                          "geoslab 703 lt bt",
                          "microsoft uighur",
                          "tristan",
                          "gill sans mt ext condensed bold",
                          "kartika",
                          "futurablack bt",
                          "ayuthaya",
                          "calibri",
                          "swis721 blkex bt",
                          "harlow solid italic",
                          "test-font",
                          "poor richard",
                          "helvetica",
                          "sketch rockwell",
                          "lilyupc",
                          "trajan",
                          "verdana",
                          "broadway",
                          "clarendon condensed",
                          "newsgoth bt",
                          "db lcd temp",
                          "nsimsun",
                          "osaka",
                          "frankruehl",
                          "cg omega",
                          "rod",
                          "eurostile",
                          "myriad",
                          "eras medium itc",
                          "gotham",
                          "french script mt",
                          "matisse itc",
                          "vani",
                          "bookman old style",
                          "lucida fax",
                          "miriam fixed",
                          "aurora cn bt",
                          "simplified arabic fixed",
                          "futura",
                          "baskerville old face",
                          "bankgothic md bt",
                          "tw cen mt condensed",
                          "boulder",
                          "informal roman",
                          "shonar bangla",
                          "bremen bd bt",
                          "ms ui gothic",
                          "rage italic",
                          "pythagoras",
                          "parchment",
                          "simplified arabic",
                          "scriptina",
                          "charlesworth",
                          "arial black",
                          "kokila",
                          "malgun gothic",
                          "microsoft yahei",
                          "perpetua titling mt",
                          "script",
                          "dokchampa",
                          "snell roundhand",
                          "sinhala sangam mn",
                          "krungthep",
                          "calisto mt",
                          "nevis",
                          "zwadobef",
                          "bernard mt condensed",
                          "harrington",
                          "ozhandicraft bt",
                          "jazz let",
                          "charter bt",
                          "museo",
                          "wingdings 2",
                          "kaufmann bd bt",
                          "angsanaupc",
                          "jasmineupc",
                          "mingliu-extb",
                          "apple color emoji",
                          "frutiger",
                          "ms outlook",
                          "modern no. 20",
                          "bodoni mt poster compressed",
                          "marlett",
                          "copperplate gothic",
                          "wingdings",
                          "candara",
                          "bitstream vera sans mono",
                          "copperplate gothic light",
                          "eras light itc",
                          "serifa",
                          "mrs eaves",
                          "curlz mt",
                          "bookshelf symbol 7",
                          "cochin",
                          "dauphin",
                          "westminster",
                          "subway",
                          "colonna mt",
                          "arial unicode ms",
                          "posterbodoni bt",
                          "abadi mt condensed light",
                          "narkisim",
                          "clarendon",
                          "consolas",
                          "corbel",
                          "fruitger",
                          "ms linedraw",
                          "segoe ui symbol",
                          "pristina",
                          "mingliu_hkscs-extb",
                          "footlight mt light",
                          "archer",
                          "cambria",
                          "mingliu_hkscs",
                          "comic sans",
                          "noteworthy",
                          "news gothic",
                          "freefrm721 blk bt",
                          "latha",
                          "gurmukhi mn",
                          "mistral",
                          "mv boli",
                          "fontin",
                          "lucida calligraphy",
                          "poster",
                          "courier new",
                          "mono",
                          "tw cen mt",
                          "marker felt",
                          "maiandra gd",
                          "tw cen mt condensed extra bold",
                          "nadeem",
                          "wingdings 3",
                          "cooper black",
                          "papyrus",
                          "cordiaupc",
                          "segoe ui semibold",
                          "euphemia",
                          "fransiscan",
                          "edwardian script itc",
                          "mangal",
                          "plantagenet cherokee",
                          "californian fb",
                          "tunga",
                          "silkscreen",
                          "haettenschweiler",
                          "sceptre",
                          "gungsuhche",
                          "petitabold",
                          "jester",
                          "zapfellipt bt",
                          "american typewriter",
                          "chelthmitc bk bt",
                          "pickwick",
                          "avantgarde md bt",
                          "bernhardmod bt",
                          "arial rounded mt bold",
                          "gill sans",
                          "humanst521 lt bt",
                          "informal011 bt",
                          "ms sans serif",
                          "adobe caslon pro",
                          "aparajita",
                          "geneva",
                          "gloucester mt extra condensed",
                          "univers",
                          "blairmditc tt",
                          "trebuchet ms",
                          "thonburi",
                          "goudy stout",
                          "irisupc",
                          "microsoft new tai lue",
                          "system",
                          "perpetua",
                          "batang",
                          "stencil",
                          "lucida grande",
                          "skia",
                          "avenir",
                          "lao ui",
                          "arial mt",
                          "fangsong",
                          "ms reference specialty",
                          "synchro let",
                          "andalus",
                          "blackadder itc",
                          "steamer",
                          "mingliu",
                          "elephant",
                          "lucida handwriting",
                          "lithograph light",
                          "serifa th bt",
                          "styllo",
                          "trajan pro",
                          "traditional arabic",
                          "futura zblk bt",
                          "microsoft phagspa",
                          "gabriola",
                          "geometr231 hv bt",
                          "bangla sangam mn",
                          "copperplate gothic bold",
                          "bodoni 72",
                          "kaiti",
                          "utsaah",
                          "microsoft jhenghei",
                          "vijaya",
                          "kabel bk bt",
                          "gulim",
                          "geeza pro",
                          "tahoma",
                          "futura lt bt",
                          "centaur",
                          "tempus sans itc",
                          "segoe print",
                          "microsoft himalaya",
                          "tubular",
                          "goudyhandtooled bt",
                          "kalinga",
                          "interstate",
                          "ms reference sans serif",
                          "typoupright bt",
                          "english 111 vivace bt",
                          "ms gothic",
                          "big caslon",
                          "cezanne",
                          "minion",
                          "palace script mt",
                          "dotumche",
                          "pmingliu",
                          "heiti sc",
                          "kannada sangam mn",
                          "malayalam sangam mn",
                          "heiti tc",
                          "cg times",
                          "goudyolst bt",
                          "simsun-extb",
                          "eucrosiaupc",
                          "gujarati sangam mn",
                          "viner hand itc",
                          "chaucer",
                          "freesiaupc",
                          "helv",
                          "gigi",
                          "letter gothic",
                          "nyala",
                          "vivaldi",
                          "bodoni mt condensed",
                          "freestyle script",
                          "souvenir lt bt",
                          "staccato222 bt",
                          "segoe script",
                          "frnkgothitc bk bt",
                          "felix titling",
                          "hiragino kaku gothic pron",
                          "din",
                          "century schoolbook",
                          "simsun",
                          "terminal",
                          "meiryo",
                          "microsoft tai le",
                          "kabel ult bt",
                          "myriad pro",
                          "algerian",
                          "copperplate",
                          "telugu sangam mn",
                          "leelawadee",
                          "academy engraved let",
                          "roman",
                          "browallia new",
                          "market",
                          "marion",
                          "zurich blkex bt",
                          "bodoni mt",
                          "arial narrow",
                          "gulimche",
                          "humanst 521 cn bt",
                          "bandy",
                          "engravers mt",
                          "times",
                          "helvetica neue",
                          "david",
                          "euphemia ucas",
                          "news gothicmt",
                          "wide latin",
                          "univers ce 55 medium",
                          nullptr};

const char* variantB[] = {"ms pmincho",
                          "lucida fax demibold",
                          "kino mt",
                          "gloucester mt extra condensed",
                          "big caslon medium",
                          "microsoft yi baiti",
                          "apple braille pinpoint 6 dot",
                          "modern",
                          "news gothic mt bold",
                          "arial bold",
                          "american typewriter condensed",
                          "futura medium",
                          "bell mt italic",
                          "hoefler text black",
                          "stxihei",
                          "tw cen mt bold",
                          "arial narrow bold",
                          "heiti tc light",
                          "palatino linotype",
                          "hiragino mincho pron w6",
                          "perpetua titling mt",
                          "hei regular",
                          "playbill",
                          "georgia bold",
                          "geeza pro bold",
                          "hiragino sans gb w6",
                          "perpetua",
                          "meiryo bold",
                          "hoefler text ornaments",
                          "stencil",
                          "times roman",
                          "courier new bold",
                          "papyrus condensed",
                          "chalkboard se bold",
                          "hiragino kaku gothic stdn w8",
                          "avenir",
                          "apple sd gothic neo regular",
                          "consolas bold",
                          "skia regular",
                          "palatino bold",
                          "corbel bold",
                          "avenir next demi bold",
                          "franklin gothic medium",
                          "calisto mt",
                          "candara bold",
                          "arial bold italic",
                          "ms reference specialty",
                          "bernard mt condensed",
                          "harrington",
                          "pt sans bold",
                          "nanum gothic",
                          "stixsizethreesym-bold",
                          "applegothic regular",
                          "kai regular",
                          "trebuchet ms bold",
                          "khmer mn bold",
                          "american typewriter light",
                          "mingliu",
                          "helvetica neue bold",
                          "mongolian baiti",
                          "myanmar mn bold",
                          "apple lisung light",
                          "constantia",
                          "courier new italic",
                          "lucida handwriting",
                          "times bold",
                          "mingliu-extb",
                          "telugu mn bold",
                          "courier bold",
                          "goudy old style bold",
                          "applemyungjo regular",
                          "lucida sans typewriter",
                          "gill sans bold",
                          "oriya sangam mn bold",
                          "britannic bold",
                          "stixintegralsupd-bold",
                          "stixsizeonesym-bold",
                          "gill sans ultra bold",
                          "pmingliu-extb",
                          "gabriola",
                          "desdemona",
                          "modern no. 20",
                          "didot bold",
                          "copperplate gothic bold",
                          "franklin gothic medium italic",
                          "marlett",
                          "hiragino kaku gothic pro w3",
                          "lucida handwriting italic",
                          "kefa bold",
                          "stixintegralsup-bold",
                          "engravers mt bold",
                          "gill sans mt",
                          "optima bold",
                          "rockwell",
                          "baskerville semibold italic",
                          "gulim",
                          "gujarati sangam mn bold",
                          "lucida sans demibold italic",
                          "monotype corsiva",
                          "cambria math",
                          "perpetua bold",
                          "matura mt script capitals",
                          "tamil mn bold",
                          "lucida sans",
                          "thonburi bold",
                          "times new roman italic",
                          "microsoft himalaya",
                          "heiti sc light",
                          "gill sans mt bold",
                          "lucida bright demibold",
                          "gungseo regular",
                          "apple ligothic medium",
                          "baskerville bold",
                          "avenir black",
                          "bookshelf symbol 7",
                          "curlz mt",
                          "telugu sangam mn bold",
                          "lucida bright",
                          "colonna mt",
                          "helvetica neue medium",
                          "ms reference sans serif",
                          "rockwell italic",
                          "brush script mt italic",
                          "apple braille outline 6 dot",
                          "ms gothic",
                          "chalkboard se",
                          "pt sans caption bold",
                          "yuppy tc regular",
                          "baskerville semibold",
                          "damascus bold",
                          "mt extra",
                          "pmingliu",
                          "abadi mt condensed light",
                          "news gothic mt",
                          "consolas",
                          "ms pgothic",
                          "abadi mt condensed extra bold",
                          "stixgeneral-bold",
                          "century gothic",
                          "arial italic",
                          "corbel",
                          "hiragino sans gb w3",
                          "kailasa regular",
                          "ms mincho",
                          "braggadocio",
                          "garamond",
                          "tahoma negreta",
                          "comic sans ms bold",
                          "lucida bright demibold italic",
                          "rockwell extra bold",
                          "goudy old style",
                          "footlight mt light",
                          "mingliu_hkscs",
                          "avenir next condensed",
                          "cambria",
                          "cambria bold",
                          "euphemia ucas bold",
                          "century",
                          "helvetica light",
                          "calibri bold",
                          "chalkboard bold",
                          "kaiti sc black",
                          "marker felt thin",
                          "bangla mn bold",
                          "oriya mn bold",
                          "pcmyungjo regular",
                          "microsoft tai le bold",
                          "futura condensed extrabold",
                          "yuppy sc regular",
                          "franklin gothic book italic",
                          "apple sd gothic neo",
                          "cochin bold",
                          "courier oblique",
                          "helvetica cy bold",
                          "arial narrow bold italic",
                          "mistral",
                          "stixsizefoursym-bold",
                          "eurostile bold",
                          "kannada sangam mn bold",
                          "lucida console",
                          "stixintegralsd-bold",
                          "rockwell bold",
                          "lucida calligraphy italic",
                          "songti sc",
                          "constantia bold",
                          "lucida calligraphy",
                          "garamond bold",
                          "lucida sans typewriter bold",
                          "al bayan plain",
                          "avenir next regular",
                          "calibri",
                          "new peninim mt bold",
                          "menlo bold",
                          "stixsizetwosym-bold",
                          "nanum myeongjo",
                          "perpetua titling mt bold",
                          "times new roman bold",
                          "lucida fax regular",
                          "avenir next condensed bold",
                          "gill sans mt italic",
                          "tw cen mt",
                          "al bayan bold",
                          "bangla sangam mn bold",
                          "apple sd gothicneo extrabold",
                          "calisto mt bold",
                          "devanagari mt bold",
                          "kannada mn bold",
                          "stixgeneral-regular",
                          "hiragino mincho pron w3",
                          "helvetica bold",
                          "malayalam sangam mn bold",
                          "lucida blackletter",
                          "lucida grande bold",
                          "cooper black",
                          "gurmukhi sangam mn bold",
                          "helvetica cy plain",
                          "nanummyeongjo bold",
                          "avenir next heavy",
                          "century schoolbook",
                          "gurmukhi sangam mn",
                          "simsun",
                          "book antiqua",
                          "tw cen mt italic",
                          "meiryo",
                          "microsoft tai le",
                          "arial hebrew bold",
                          "avenir next",
                          "eurostile",
                          "lucida sans unicode",
                          "headlinea regular",
                          "nanumgothic",
                          "osaka-mono",
                          "sinhala sangam mn bold",
                          "yuppy tc",
                          "songti sc black",
                          "yuppy sc",
                          "stixvariants-bold",
                          "calibri light",
                          "onyx",
                          "bell mt bold",
                          "mshtakan bold",
                          "american typewriter bold",
                          "tamil sangam mn bold",
                          "edwardian script itc",
                          "kaiti sc",
                          "imprint mt shadow",
                          "pt sans narrow bold",
                          "copperplate light",
                          "helvetica oblique",
                          "simhei",
                          "arial",
                          "corsiva hebrew bold",
                          "verdana bold",
                          "gujarati mt bold",
                          "monotype sorts",
                          "stixintegralsupsm-bold",
                          "bookman old style",
                          "lucida fax",
                          "nanumgothic bold",
                          "stixintegralssm-bold",
                          "haettenschweiler",
                          "century gothic bold",
                          "sinhala mn bold",
                          "franklin gothic book",
                          "book antiqua bold",
                          "marion",
                          "arial narrow italic",
                          "baskerville bold italic",
                          "malayalam mn bold",
                          "pilgi regular",
                          "noteworthy bold",
                          "stixnonunicode-bold",
                          "century schoolbook bold",
                          "engravers mt",
                          "avenir next bold",
                          "copperplate bold",
                          "hiragino kaku gothic pron w3",
                          "optima regular",
                          "stixintegralsup-regular",
                          "gurmukhi mn bold",
                          "palatino linotype bold",
                          "stixsizefivesym-regular",
                          "bookman old style bold",
                          "marion bold",
                          "wide latin",
                          "kokonor regular",
                          "lucida bright italic",
                          "hiragino maru gothic pron w4",
                          "raanana bold",
                          "nanummyeongjo",
                          "stixintegralsupd-regular",
                          nullptr};
