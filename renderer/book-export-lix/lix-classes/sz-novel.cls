% sz-novel.cls — Schreibszene Roman (novel-print.html)
% 6x9 in, Akzent #2D4A3E (Waldgruen), Dropcaps, zentrierter Kapitelopener
% mit Linie-Raute-Linie-Ornament.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{sz-novel}[2026/04/24 Schreibszene Roman]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}
\ProcessOptions\relax
\LoadClass[11pt,twoside,openright]{book}

\RequirePackage[
  paperwidth=6in,paperheight=9in,
  top=24mm,bottom=26mm,inner=22mm,outer=18mm,
  headheight=14pt,headsep=6mm,footskip=10mm,
]{geometry}

\def\sz@accent{2D4A3E}
\def\sz@useDropcap{1}
\def\sz@chapterStyle{novel}
\def\sz@ornament{linediamond}

\RequirePackage{sz-common}

% Roman-spezifisch: zentrierter Kapitelopener ohne Part-Label, mit Ornament.
% Ueberschreibt sz-common-Default.
\titleformat{\chapter}[display]%
  {\thispagestyle{plain}\centering\normalfont\vspace*{36pt}}%
  {\sffamily\scriptsize\color{szPale}\MakeUppercase{Kapitel \thechapter}}%
  {14pt}%
  {\rmfamily\fontsize{34pt}{38pt}\selectfont\color{szInk}}%
  [\sz@chapterPost]
\titlespacing*{\chapter}{0pt}{0pt}{28pt}
\endinput
