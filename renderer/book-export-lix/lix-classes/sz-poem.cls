% sz-poem.cls — Schreibszene Gedichtband (poem-print.html)
% A5, nur Garamond, linksbündig, nummerierte Zwischenüberschriften,
% Seitenumbruch vor jedem Gedicht, Inhaltsverzeichnis bis Ebene 4.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{sz-poem}[2026/04/24 Schreibszene Gedichtband]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}
\ProcessOptions\relax
\LoadClass[11pt,twoside,openany]{book}

\RequirePackage[a5paper,
  top=22mm,bottom=22mm,inner=20mm,outer=20mm,
  headheight=14pt,headsep=6mm,footskip=10mm,
]{geometry}

\def\sz@accent{1A1915}
\def\sz@useDropcap{0}
\def\sz@chapterStyle{poem}
\def\sz@ornament{framed}

\RequirePackage{sz-common}

% Inhaltsverzeichnis bis Ebene 4 (subsubsection)
\setcounter{tocdepth}{3}
\setcounter{secnumdepth}{-1}

% Seitenumbruch-Flag: verhindert \clearpage wenn direkt eine Überschrift folgt.
%
% Problem: \AddToHook{para/begin} feuert auch wenn titlesec den Überschriften-
% text selbst setzt (der ist intern ein Absatz). Deshalb zwei Flags:
%   \ifprevwasheading  — war die letzte Aktion eine Überschrift?
%   \ifsz@inheading   — befinden wir uns gerade im titlesec-Rendering?
% Das para/begin-Hook resettet \prevwasheading NUR außerhalb von Überschriften.
% \sz@headingdone wird als after-code jeder Überschrift ausgeführt.
\newif\ifprevwasheading
\prevwasheadingfalse
\newif\ifsz@inheading
\sz@inheadingfalse
\newcommand{\sz@condclearpage}{%
  \ifprevwasheading\else\clearpage\thispagestyle{plain}\fi
  \global\sz@inheadingtrue
  \global\prevwasheadingtrue
}
\newcommand{\sz@headingdone}{\global\sz@inheadingfalse}
\AddToHook{para/begin}{%
  \ifsz@inheading\else\global\prevwasheadingfalse\fi
}

% Chapter (h2 = Buchteil): linksbündig, leicht fetter als Fliesstext
\titleformat{\chapter}[display]%
  {\sz@condclearpage\raggedright\normalfont\vspace*{20pt}}%
  {}%
  {0pt}%
  {\rmfamily\bfseries\fontsize{16pt}{20pt}\selectfont\color{szInk}}%
  [\sz@chapterPost\sz@headingdone]
\titlespacing*{\chapter}{0pt}{0pt}{16pt}

% Section (h3 = Gedichtgruppe): leicht fetter
\titleformat{\section}%
  {\sz@condclearpage\raggedright\normalfont\rmfamily\bfseries\fontsize{14pt}{18pt}\selectfont\color{szInk}}%
  {}%
  {0pt}%
  {}%
  [\sz@headingdone]
\titlespacing*{\section}{0pt}{18pt}{10pt}

% Subsection (h4 = Untergruppe): leicht fetter
\titleformat{\subsection}%
  {\sz@condclearpage\raggedright\normalfont\rmfamily\bfseries\fontsize{12pt}{16pt}\selectfont\color{szInk}}%
  {}%
  {0pt}%
  {}%
  [\sz@headingdone]
\titlespacing*{\subsection}{0pt}{14pt}{8pt}

% Subsubsection (h5 = Gedichttitel): auf 12pt angehoben + leicht fetter,
% damit er sich klar vom 11pt-Fliesstext abhebt
\titleformat{\subsubsection}%
  {\sz@condclearpage\raggedright\normalfont\rmfamily\bfseries\fontsize{12pt}{15pt}\selectfont\color{szInk}}%
  {}%
  {0pt}%
  {}%
  [\sz@headingdone]
\titlespacing*{\subsubsection}{0pt}{16pt}{8pt}

% Paragraph (h6 = Unterabschnitt im Gedicht, z.B. "I", "II"): kursiv, muted
\titleformat{\paragraph}[block]%
  {\raggedright\normalfont\rmfamily\itshape\fontsize{11pt}{14pt}\selectfont\color{szMuted}}%
  {}%
  {0pt}%
  {}
\titlespacing*{\paragraph}{0pt}{10pt}{4pt}

% Gedichte linksbündig, mit lockeren Zeilenabständen, nur Garamond
\RequirePackage{ragged2e}
% WICHTIG: \raggedright (via ragged2e = \RaggedRight) setzt \widowpenalty=0 und
% \clubpenalty=0. Deshalb werden die Penalties NACH \raggedright im selben Hook gesetzt.
\AtBeginDocument{%
  \raggedright\linespread{1.5}\setlength{\parindent}{0pt}\setlength{\parskip}{8pt}%
  \widowpenalty=10000\clubpenalty=10000%
  \interlinepenalty=9999% Umbruch innerhalb einer Strophe stark unerwünscht, aber möglich
}

% Silbentrennung in Lyrik unerwünscht
\hyphenpenalty=10000\exhyphenpenalty=10000

\endinput
