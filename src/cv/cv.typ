// Europass-style CV. render.ts writes view.json (and photo.jpg) next to this file.
#let data = json("view.json")
#let L = data.labels
#let p = data.personal

#let accent = rgb("#1f35a5")
#let rule-color = rgb("#7d8ed6")
#let ink = rgb("#3c3c3c")
#let muted = rgb("#5a5a5a")
#let gutter = 3.9cm

#set document(title: p.name + " - CV", author: p.name)
#set page(
  paper: "a4",
  margin: (left: 1.3cm, right: 1.4cm, top: 1.4cm, bottom: 1.6cm),
  footer: context align(right, text(size: 8pt, fill: muted)[
    #counter(page).display()/#counter(page).final().first()
  ]),
)
#set text(font: "Open Sans", size: 9.5pt, fill: ink, lang: data.lang)
#set par(leading: 0.55em, spacing: 0.85em)

// Material Design icons (Apache 2.0).
#let icon(path) = box(baseline: 15%, image(
  bytes(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path fill='#1f35a5' d='"
      + path
      + "'/></svg>",
  ),
  format: "svg",
  height: 0.95em,
  alt: "",
))
#let pin = "M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"
#let mail = "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
#let phone = "M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"

// One line of the two-column layout: gutter on the left, content on the right.
// The content is a list of lines, each set as its own paragraph.
#let row(side, lines) = grid(
  columns: (gutter, 1fr),
  column-gutter: 0.45cm,
  align(right, text(fill: muted, side)), lines.filter(l => l != none).join(parbreak()),
)

// Sticky, so a heading never ends a page without its first entry.
#let section(label) = block(sticky: true, above: 1.3em, below: 0.9em, row(
  text(weight: "bold", upper(label)),
  (block(above: 0pt, inset: (top: 0.55em), line(length: 100%, stroke: 0.6pt + rule-color)),),
))

#let sep = text(fill: luma(170))[ | ]
#let field(label, value) = if value != none [#text(weight: "bold", label + ":") #value]
#let title(body) = text(size: 10.5pt, weight: "bold", body)
#let org(body) = text(size: 10.5pt, weight: "bold", style: "italic", body)

// Header
#grid(
  columns: (gutter, 1fr),
  column-gutter: 0.45cm,
  align(center, if data.photo {
    box(
      width: 3.1cm,
      height: 3.1cm,
      radius: 50%,
      clip: true,
      stroke: 1.8pt + accent,
      image("photo.jpg", width: 100%, height: 100%, fit: "cover", alt: p.name),
    )
  }),
  {
    v(0.2em)
    text(size: 18pt, weight: "bold", p.name)
    if data.headline != none { linebreak(); text(size: 11pt, data.headline) }
    v(0.3em)
    if p.location != none [#icon(pin) #field(L.address, p.location)]
    let contacts = ()
    if p.email != none { contacts.push[#icon(mail) #field(L.email, p.email)] }
    if p.phone != none { contacts.push[#icon(phone) #field(L.phone, p.phone)] }
    if contacts.len() > 0 { parbreak(); contacts.join(h(0.8em)) }
    for l in p.links { parbreak(); field(l.label, l.url) }
  },
)

#if data.summary != none {
  section(L.summary)
  row([], (data.summary,))
}

#if data.experience.len() > 0 {
  section(L.experience)
  for g in data.experience {
    row([], (org(g.company), field(L.place, g.place)))
    for r in g.roles {
      row(r.dates, (title(r.role), ..r.bullets))
    }
    v(0.6em)
  }
}

#if data.education.len() > 0 {
  section(L.education)
  for e in data.education {
    row(e.dates, (title(e.degree), org(e.institution), field(L.place, e.place), ..e.details))
    v(0.5em)
  }
}

#if data.languages.len() > 0 {
  section(L.languages)
  for l in data.languages {
    row([], ([*#l.language*#if l.level != none [: #l.level]],))
  }
}

#if data.skills.len() > 0 {
  section(L.skills)
  for s in data.skills {
    row([], (strong(s.group), s.items.join(sep)))
  }
}

#if data.certifications.len() > 0 {
  section(L.certifications)
  for c in data.certifications {
    row(c.date, (strong(c.name), c.issuer))
  }
}

#if data.projects.len() > 0 {
  section(L.projects)
  for pr in data.projects {
    row([], (strong(pr.name), pr.description))
    v(0.3em)
  }
}

#if data.other.len() > 0 {
  section(L.other)
  row([], data.other)
}

#v(1.2em)
#line(length: 100%, stroke: 0.6pt + rule-color)
#text(size: 8.5pt, style: "italic", L.consent)
