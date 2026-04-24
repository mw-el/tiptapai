% sz-textbook.cls — Schreibszene Lehrbuch (textbook-print.html)
% A4, Akzent #1E3A5F (Navy), keine Dropcaps, Sans-Kapitelueberschrift,
% numerierte Gliederung, Pullquote und Code-Block.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{sz-textbook}[2026/04/24 Schreibszene Lehrbuch]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}
\ProcessOptions\relax
\LoadClass[11pt,twoside,openany]{book}

\RequirePackage[a4paper,
  top=26mm,bottom=28mm,inner=24mm,outer=22mm,
  headheight=14pt,headsep=6mm,footskip=10mm,
]{geometry}

\def\sz@accent{1E3A5F}
\def\sz@useDropcap{0}
\def\sz@chapterStyle{textbook}
\def\sz@ornament{ornbar}

\RequirePackage{sz-common}

% Kapitel: gross, Sans-Serif, Akzentfarbe (wie in textbook-print h1).
\titleformat{\chapter}[display]%
  {\thispagestyle{plain}\raggedright\normalfont\vspace*{12pt}}%
  {\sffamily\scriptsize\color{szPale}\MakeUppercase{Kapitel \thechapter}}%
  {10pt}%
  {\sffamily\fontsize{26pt}{30pt}\bfseries\color{szAccent}}%
  [\sz@chapterPost]
\titlespacing*{\chapter}{0pt}{0pt}{22pt}

% Sections: Sans-Serif, Semibold.
\titleformat*{\section}{\sffamily\fontsize{14pt}{18pt}\bfseries\color{szInk}}
\titleformat*{\subsection}{\sffamily\fontsize{11pt}{14pt}\itshape\color{szInk}}
\titleformat*{\subsubsection}{\sffamily\small\color{szAccent}\MakeUppercase}
\titlespacing*{\section}{0pt}{16pt}{5pt}
\titlespacing*{\subsection}{0pt}{11pt}{4pt}

% Gliederungsnumerierung tiefer
\setcounter{secnumdepth}{3}

\endinput
