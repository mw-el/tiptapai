<rules>

  <rule id="R01" category="Schweizer Besonderheit">
    <title>Kein Eszett</title>
    <description>
      In der Schweiz wird das Eszett ausnahmslos durch ss ersetzt.
      Korrekt: Strasse, Gruss, heissen, dass, Fluss, wissen, gross.
      AUSNAHME: Wenn das Zeichen selbst erklaert oder demonstriert wird
      (z.B. in einem Text ueber Unterschiede DE/CH), NICHT ersetzen.
      Solche Faelle gehoeren in do_not_flag.
    </description>
  </rule>

  <rule id="R02" category="Gross- und Kleinschreibung">
    <title>Substantive und Substantivierungen</title>
    <description>
      Substantive grossgeschrieben: der Hund, das Haus.
      Substantivierungen ebenfalls: das Laufen, das Blau, im Grossen und Ganzen.
      Satzanfaenge immer gross.
      Nach Doppelpunkt: gross bei vollstaendigem Folgesatz, sonst klein.
      Tageszeiten nach heute/gestern/morgen gross: heute Abend, morgen Frueh.
    </description>
  </rule>

  <rule id="R03" category="Gross- und Kleinschreibung">
    <title>Anredepronomen</title>
    <description>
      Sie (Hoeflichkeitsform) und alle Formen (Ihnen, Ihr, Ihre, Ihres)
      immer grossgeschrieben.
      du/dich/dir/dein und ihr/euch/euer: gross oder klein, aber einheitlich
      im gesamten Text. Wenn der Text beide Varianten mischt, als Fehler melden.
    </description>
  </rule>

  <rule id="R04" category="Kommasetzung">
    <title>Kommaregeln</title>
    <description>
      Aufzaehlungen ohne Konjunktion: Komma (Aepfel, Birnen, Kirschen).
      Vor und/oder: KEIN Komma bei gleichrangigen Satzgliedern.
      Vor und/oder: KOMMA bei zwei vollstaendigen Hauptsaetzen
        (Ich gehe, und er bleibt.).
      Vor aber, sondern, doch, jedoch, denn: Komma.
      Nebensaetze durch Komma abtrennen.
      Infinitivgruppen mit um...zu, ohne...zu, anstatt...zu: Komma.
      Eingeschobene Appositionen: beidseitig Komma.
    </description>
  </rule>

  <rule id="R05" category="Getrennt- und Zusammenschreibung">
    <title>Getrennt- und Zusammenschreibung</title>
    <description>
      Zusammengesetzte Substantive zusammen: Haustuer, Schreibtisch.
      Verb + Substantiv getrennt bei selbststaendigem Substantiv:
        Auto fahren, Rad fahren.
      Verb + Verb zusammen bei fester Einheit:
        kennenlernen, stattfinden, teilnehmen.
      Adjektiv + Verb getrennt (schoen schreiben), zusammen bei
        uebertragener Bedeutung (schlechtmachen, fertigstellen).
      nicht + Adjektiv/Partizip: getrennt (nicht korrekt).
    </description>
  </rule>

  <rule id="R06" category="Zeichensetzung">
    <title>Satzzeichen und Anfuehrungszeichen</title>
    <description>
      Punkt nach Satzende, nach Ordinalzahlen (1. Mai), nach Abkuerzungen
        (z.B., usw., bzw.). Kein Punkt nach Masseinheiten (kg, m, km/h).
      Anfuehrungszeichen: Guillemets («») sind verbindlich in laufendem Text.
      Normale Anfuehrungszeichen ("...") und deutsche Gaensefuesschen („...")
      als Fehler melden und durch «» ersetzen.
      AUSNAHME: Inhalte in Code-Bloecken und Inline-Code nicht anfassen.
      Semantisch notwendige ASCII-Quotes (technische Syntaxdemo,
      Programmierkontexte ausserhalb Code-Bloecken) beibehalten und markieren.
      Bindestrich bei Zusammensetzungen mit Ziffern/Abkuerzungen
        (IT-Infrastruktur, 3-mal), bei unuebersichtlichen Komposita.
    </description>
  </rule>

  <rule id="R07" category="Apostroph">
    <title>Apostroph</title>
    <description>
      Apostroph NUR bei:
      - Genitiv von Eigennamen auf Zischlaut: Klaus' Buch, Markus' Idee.
      - Auslassungen, die ohne Apostroph missverstaendlich waeren:
        wie's (wie es), hat's (hat es) – NUR wenn Verwechslungsgefahr besteht.

      NIEMALS flaggen:
      - Kontraktionen ohne Verwechslungsgefahr: wirds, stimmts, gehts,
        gibts, hasts, wars.
      - Umgangssprachliche Formen in informellem Kontext.
      - Tausendertrenner: 1'000, 25'000 (siehe R09).

      Kurzregel: Im Zweifel NICHT flaggen.
    </description>
  </rule>

  <rule id="R08" category="s-Schreibung">
    <title>s-Schreibung (Schweiz)</title>
    <description>
      In der Schweiz gibt es kein Eszett. Die s-Schreibung folgt diesen Regeln:
      - ss nach kurzem, betontem Vokal: Fluss, Kuss, muss, wissen, dass, lassen.
      - Einfaches s nach langem Vokal oder Diphthong: Hase, lesen, Nase,
        reisen, Haus, Maus, heiser.
      - Einfaches s bei stimmhaftem s (weich, summend): Hase, lesen, reisen.
      - ss am Wortende oder vor Konsonant: muss, wusste, Schluss.
      Faustregel: Kurzer Vokal = ss. Langer Vokal oder Diphthong = s.
    </description>
  </rule>

  <rule id="R09" category="Zahlen und Datum">
    <title>Zahlen, Datum, Massangaben</title>
    <description>
      Datum in Fliesstext ausgeschrieben: 1. Maerz 2026 (nicht 01.03.2026).
      Zahlen eins bis zwoelf ausschreiben, ab 13 als Ziffer.
      Massangaben: Zahl und Einheit mit Leerzeichen: 25 kg, 100 km.
      Prozent: 25 Prozent in Fliesstext, 25 % in Tabellen/technischen Texten.
      Tausendertrenner: Apostroph oder Leerschlag (1'000 oder 1 000).
      KEIN Punkt als Tausendertrenner (nicht: 1.000).
    </description>
  </rule>

  <rule id="R10" category="Fremdwoerter">
    <title>Fremdwoerter und Eindeutschungen</title>
    <description>
      Eingedeutschte Fremdwoerter folgen deutschen Regeln:
        Foto (nicht Photo), Telefon (nicht Telephon), Buero (nicht Bureau).
      Schweizspezifische Schreibung bei franzoesischen Lehnwoertern:
        Menu (nicht Menü), Trottoir, Velo, Billet, Perron, Kondukteur.
      Nicht eingedeutschte Fremdwoerter behalten Originalschreibung:
        Computer, Software.
      E-Mail: In der Schweiz ist «das E-Mail» (Neutrum) korrekt und gueltig.
        Nicht korrigieren.
      Im Zweifel: Duden-Empfehlung; Schweizer Variante bevorzugen
      wenn beide zulaessig.
    </description>
  </rule>


  <rule id="R11" category="Aufzählungen">
    <title>Bullet Points mit vollständigen Sätzen</title>
    <description>
      Wenn Einträge in einer Bullet-Point-Liste vollständige Sätze sind
      (Subjekt + finites Verb oder vollständiger Imperativsatz):
      - Ersten Buchstaben grossschreiben.
      - Eintrag mit einem Punkt abschliessen (falls kein anderes Satzzeichen
        wie ?, ! oder schliessendes Anführungszeichen mit innerem Punkt das Ende markiert).
      Einträge ohne finites Verb (Nominalphrasen, Infinitivkonstruktionen)
      sind von dieser Regel ausgenommen.
    </description>
  </rule>

</rules>

<do_not_flag>
  Diese Faelle NIEMALS als Fehler melden:

  1. LINK-PFADE UND DATEINAMEN
     Dateinamen in Markdown-Links, HTML-Attributen oder URLs:
     ![Alt](pfad/datei.webp), src="...", href="...",
     Frontmatter-Felder image:/cover: wenn der Wert ein Pfad ist.
     Sluggifizierte Schreibweisen sind absichtlich (ue statt ü).
     AUSNAHME: Sichtbarer Alt-Text darf gemeldet werden.

  2. ABSICHTLICHE FEHLER ALS NEGATIVBEISPIEL
     Erkennungsmerkmale: Falsch:, So nicht:, Fehler:,
     Gegenueberstellung mit Korrekt:/Richtig:, metasprachlicher Kontext.
     Kurzregel: Wenn ein Fehler ueber sich selbst spricht, nicht flaggen.

  3. CODE-BLOECKE UND INLINE-CODE
     Inhalte zwischen Backticks oder in Codeblocks nicht pruefen.

  4. TAUSENDERTRENNER-APOSTROPHE
     1'000, 25'000, 1'234'567 sind korrekte Schweizer Schreibweise.

  5. EIGENNAMEN UND FACHBEGRIFFE
     Marken, Produktnamen, Fachausdruecke in ihrer etablierten
     Schreibweise belassen (ClaudeAuto, TipTap, JavaScript).
</do_not_flag>
