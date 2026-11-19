// Cover letter in the same look as cv.typ. render.ts writes view.json next to this file.
#let data = json("view.json")
#let p = data.personal

#let accent = rgb("#1f35a5")
#let rule-color = rgb("#7d8ed6")
#let ink = rgb("#3c3c3c")
#let muted = rgb("#5a5a5a")

#set document(title: p.name + " - " + data.subject, author: p.name)
#set page(paper: "a4", margin: (x: 2.2cm, top: 2cm, bottom: 2.2cm))
#set text(font: "Open Sans", size: 10.5pt, fill: ink, lang: data.lang)
#set par(leading: 0.65em, spacing: 1.1em, justify: false)

#text(size: 18pt, weight: "bold", fill: accent, p.name)
#v(-0.4em)
#text(size: 9pt, fill: muted, (p.location, p.email, p.phone).filter(x => x != none).join("  |  "))
#v(-0.2em)
#line(length: 100%, stroke: 0.6pt + rule-color)

#v(1.2em)
#align(right, data.date)
#data.company

#v(0.8em)
#text(weight: "bold", data.subject)
#v(0.4em)

#for para in data.paragraphs {
  // Single newlines inside a paragraph stay, so a closing and signature keep their lines.
  par(para.split("\n").join(linebreak()))
}
