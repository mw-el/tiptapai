% sz-novella.cls — Schreibszene Novelle/Kurzgeschichte (novella-print.html)
% 5.5x8.5 in, Akzent #5A3842 (Burgund), keine Dropcaps, schlanker Kapitelopener.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{sz-novella}[2026/04/24 Schreibszene Novelle]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}
\ProcessOptions\relax
\LoadClass[11pt,twoside,openright]{book}

\RequirePackage[
  paperwidth=5.5in,paperheight=8.5in,
  top=20mm,bottom=22mm,inner=20mm,outer=16mm,
  headheight=14pt,headsep=5mm,footskip=8mm,
]{geometry}

\def\sz@accent{5A3842}
\def\sz@useDropcap{0}
\def\sz@chapterStyle{novella}
\def\sz@ornament{line}

\RequirePackage{sz-common}

% Novella-Opener: zentriert, kleinerer Titel, feine Linie als Ornament.
\titleformat{\chapter}[display]%
  {\thispagestyle{plain}\centering\normalfont\vspace*{24pt}}%
  {\sffamily\scriptsize\color{szPale}\MakeUppercase{Kapitel \thechapter}}%
  {12pt}%
  {\rmfamily\fontsize{30pt}{34pt}\selectfont\color{szInk}}%
  [\sz@chapterPost]
\titlespacing*{\chapter}{0pt}{0pt}{24pt}
\endinput
