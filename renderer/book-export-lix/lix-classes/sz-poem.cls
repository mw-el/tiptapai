% sz-poem.cls — Schreibszene Gedichtband (poem-print.html)
% A5, Akzent #3D3550 (gedaempftes Violett), zentrierte Stanzas,
% ornamentale Zierrahmen optional, Silbentrennung aus.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{sz-poem}[2026/04/24 Schreibszene Gedichtband]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}
\ProcessOptions\relax
\LoadClass[11pt,twoside,openany]{book}

\RequirePackage[a5paper,
  top=22mm,bottom=22mm,inner=20mm,outer=20mm,
  headheight=14pt,headsep=6mm,footskip=10mm,
]{geometry}

\def\sz@accent{3D3550}
\def\sz@useDropcap{0}
\def\sz@chapterStyle{poem}
\def\sz@ornament{framed}

\RequirePackage{sz-common}

% Gedicht-Opener: italic, zentriert, feine Linie (keine Kapitelnummer).
\titleformat{\chapter}[display]%
  {\thispagestyle{plain}\centering\normalfont\vspace*{40pt}}%
  {}%
  {0pt}%
  {\rmfamily\itshape\fontsize{18pt}{22pt}\selectfont\color{szInk}}%
  [\sz@chapterPost]
\titlespacing*{\chapter}{0pt}{0pt}{20pt}

% Gedichte werden zentriert, mit lockeren Zeilenabstaenden.
\RequirePackage{ragged2e}
\renewcommand{\RaggedRightLeftskip}{0pt plus 0em}
\AtBeginDocument{\centering\linespread{1.5}\setlength{\parindent}{0pt}\setlength{\parskip}{8pt}}

% Silbentrennung in Lyrik unerwuenscht
\hyphenpenalty=10000\exhyphenpenalty=10000

\endinput
