"""Szkice kart przygotowane z ChPL (NIEZWERYFIKOWANE).

Wczytywane tylko przy tworzeniu nowej karty. Gdy karta istnieje w app/data/leki.json,
jej treść ma pierwszeństwo – edycja odbywa się w panelu admina.
Płyny: nazwa + ok (True = dozwolony wg ChPL, False = niezgodny / unikać).
"""


def P(nazwa, ok=True):
    return dict(nazwa=nazwa, ok=ok)


def U(tekst, wazne=False):
    return dict(tekst=tekst, wazne=wazne)


SZKICE = {
    "metamizol": dict(
        opakowanie="amp. 2 ml (1 g) i 5 ml (2,5 g)",
        plyny=[P("NaCl 0,9%"), P("Glukoza 5%"), P("Ringer")],
        przygotowanie=["Rozcieńczenie 1:10 (opcjonalne przed podaniem iv)", "2 ml w 20 ml · 5 ml w 50 ml"],
        tempo=["Wstrzykiwać bardzo powoli: max 500 mg/min (1 ml/min)"],
        uwagi=[
            U("Przed podaniem ogrzać do temperatury ciała. Pacjent leżący, kontrola RR, tętna i oddechu (ryzyko spadku ciśnienia i anafilaksji).", True),
            U("Podać od razu po rozcieńczeniu. Zażółcenie roztworu nie zmienia jego właściwości."),
            U("Wg ChPL można zmieszać z tramadolem 50 mg/ml w podanych płynach."),
        ],
        punkty="4.2, 6.3, 6.6",
    ),
    "amiodaron": dict(
        opakowanie="amp. 3 ml (150 mg)",
        plyny=[P("Glukoza 5%"), P("NaCl 0,9%", False)],
        przygotowanie=[
            "Wlew nasycający: 5 mg/kg mc. w 250 ml G5%",
            "Sytuacje nagłe: 150–300 mg w 10–20 ml G5%",
            "Nie rozcieńczać bardziej niż 300 mg / 500 ml (roztwór niestabilny)",
        ],
        tempo=["Wlew nasycający: 20 min – 2 h", "Wstrzyknięcie: co najmniej 3 min, kolejne nie wcześniej niż po 15 min"],
        uwagi=[
            U("TYLKO glukoza 5%. Z solą fizjologiczną niezgodny.", True),
            U("Wlew ciągły lub powtarzany przez dostęp centralny. Tylko z monitorowaniem EKG."),
            U("Nie mieszać z innymi lekami w tej samej strzykawce."),
        ],
        punkty="4.2",
    ),
    "ketoprofen": dict(
        opakowanie="amp. 2 ml (100 mg)",
        plyny=[P("NaCl 0,9%"), P("Ringer z mleczanami"), P("Glukoza 5%")],
        przygotowanie=["Krótki wlew: 100–200 mg uzupełnić do 100 ml NaCl 0,9%", "Wlew ciągły: 100–200 mg do 500 ml (NaCl 0,9%, Ringer z mleczanami, G5%)"],
        tempo=["Krótki wlew: 30–60 min · ciągły: 8 h", "Max 200 mg/dobę, powtórka po 8 h"],
        uwagi=[
            U("Nie łączyć z tramadolem w jednej butelce: wytrąca się osad.", True),
            U("Można zmieszać z morfiną w 500 ml NaCl 0,9% lub Ringera z mleczanami."),
        ],
        punkty="4.2, 6.2",
    ),
    "pantoprazol": dict(
        opakowanie="fiolka 40 mg (proszek)",
        plyny=[P("NaCl 0,9%"), P("Glukoza 5%")],
        przygotowanie=["Rozpuścić proszek w 10 ml NaCl 0,9%", "Podać bezpośrednio albo w 100 ml NaCl 0,9% lub G5%"],
        tempo=["Podawać przez 2–15 min"],
        uwagi=[U("Zużyć w ciągu 12 h od przygotowania, najlepiej od razu."), U("Dożylnie tylko, gdy nie można podać doustnie.")],
        punkty="4.2, 6.3",
    ),
    "furosemid": dict(
        opakowanie="amp. 2 ml (20 mg)",
        plyny=[P("NaCl 0,9%"), P("Ringer"), P("Ringer z mleczanami"), P("Glukoza", False)],
        przygotowanie=["Stężenie po rozcieńczeniu: 0,02–5 mg/ml"],
        tempo=["Iv max 4 mg/min", "Ciężka niewydolność nerek: max 2,5 mg/min"],
        uwagi=[U("Unikać roztworów glukozy: niskie pH może wytrącić furosemid.", True), U("Nie mieszać w strzykawce z innymi lekami.")],
        punkty="4.2, 6.2, 6.6",
    ),
    "kcl": dict(
        opakowanie="amp. 10 ml (20 mmol K⁺) · fiolka 20 ml (40 mmol K⁺)",
        plyny=[P("Glukoza 5%"), P("NaCl 0,9%"), P("Ringer"), P("Ringer z mleczanami")],
        przygotowanie=["10 ml (20 mmol) rozcieńczyć do 500 ml", "20 ml (40 mmol) rozcieńczyć do 1000 ml", "Stężenie po rozcieńczeniu: 40 mmol/l, dokładnie wymieszać"],
        tempo=["Max 20 mmol K⁺/h", "Stężenie w infuzji max 40 mmol/l"],
        uwagi=[
            U("Nigdy bez rozcieńczenia, nawet przy dużej hipokaliemii.", True),
            U("Nie łączyć m.in. z mannitolem, diazepamem, dobutaminą, metyloprednizolonem, amoksycyliną (pełna lista w pkt 6.2).", True),
            U("Przygotować bezpośrednio przed podaniem, zużyć w ciągu 6 h."),
        ],
        punkty="4.2, 6.2, 6.6",
    ),
    "paracetamol": dict(
        opakowanie="fiolka/worek 100 ml (1 g) · 50 ml (500 mg)",
        plyny=[P("NaCl 0,9%"), P("Glukoza 5%")],
        przygotowanie=["Gotowy do podania (10 mg/ml)", "Można rozcieńczyć 1:10 (1 część leku + 9 części płynu)"],
        tempo=["Wlew 15 min", "Odstęp między dawkami min. 4 h (6 h przy ciężkiej niewydolności nerek)"],
        uwagi=[
            U("Nie mieszać z innymi lekami.", True),
            U("Po rozcieńczeniu zużyć od razu, max 6 h łącznie z czasem wlewu."),
            U("Pilnować końca wlewu, szczególnie przez wkłucie centralne (zator powietrzny)."),
        ],
        punkty="4.2, 6.2, 6.3, 6.6",
    ),
    "deksketoprofen": dict(
        opakowanie="amp. 2 ml (50 mg)",
        plyny=[P("NaCl 0,9%"), P("Glukoza 5%"), P("Ringer")],
        przygotowanie=["Wlew: 1 amp. (2 ml) w 30–100 ml płynu", "Bolus: bez rozcieńczania"],
        tempo=["Wlew: 10–30 min", "Bolus: powoli, nie krócej niż 15 s"],
        uwagi=[
            U("W strzykawce nie mieszać z dopaminą, prometazyną, pentazocyną, petydyną ani hydroksyzyną (wytrąca się).", True),
            U("Roztwór chronić przed światłem dziennym."),
        ],
        punkty="4.2, 6.2, 6.3, 6.6",
    ),
    "ondansetron": dict(
        opakowanie="amp. 2 ml (4 mg) · 4 ml (8 mg)",
        plyny=[P("NaCl 0,9%"), P("Glukoza 5%"), P("Ringer z mleczanami"), P("Mannitol 10%")],
        przygotowanie=["Do 8 mg: wstrzyknięcie iv bez rozcieńczania", "Powyżej 8 mg (max 16 mg): w 50–100 ml płynu"],
        tempo=["Wstrzyknięcie: min. 30 s", "Wlew (dawki > 8 mg): min. 15 min"],
        uwagi=[
            U("Nie podawać w jednej strzykawce ani wlewie z innymi lekami.", True),
            U("Pojedyncza dawka max 16 mg (ryzyko wydłużenia QT)."),
            U("Rozcieńczony roztwór chronić przed światłem."),
        ],
        punkty="4.2, 6.2, 6.3, 6.6",
    ),
}
