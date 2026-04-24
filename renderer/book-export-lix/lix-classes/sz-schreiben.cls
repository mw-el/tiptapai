% sz-schreiben.cls — Schreibszene Schreibsachbuch (schreiben-print.html)
% 6x9 in, Akzent #2A4A6E, keine Dropcaps, schlichter Akzentstrich.
\NeedsTeXFormat{LaTeX2e}
\ProvidesClass{sz-schreiben}[2026/04/24 Schreibszene Sachbuch-Format]
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{book}}
\ProcessOptions\relax
\LoadClass[11pt,twoside,openany]{book}

\RequirePackage[
  paperwidth=6in,paperheight=9in,
  top=20mm,bottom=24mm,inner=22mm,outer=17mm,
  headheight=14pt,headsep=6mm,footskip=10mm,
]{geometry}

\def\sz@accent{2A4A6E}
\def\sz@useDropcap{0}
\def\sz@chapterStyle{schreiben}
\def\sz@ornament{line}

\RequirePackage{sz-common}
\endinput
