---
title: "À propos"
showDate: false
showReadingTime: false
showWordCount: false
---

{{< lead >}}
Diplômé d'un master en cryptologie et sécurité informatique, spécialisé en rétro-ingénierie et analyse de malwares.
{{< /lead >}}

{{< button href="/assets/cv_fr.pdf" target="_blank" >}}
Télécharger mon CV
{{< /button >}}

---

## Compétences techniques

{{< rawhtml >}}
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin:1.5rem 0">

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Langages</strong><br>Python · C · x86/x64 Assembly · LaTeX
</div>

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Analyse statique</strong><br>Ghidra · Binary Ninja
</div>

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Analyse dynamique</strong><br>GDB · WinDbg · Reven TTD
</div>

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Virtualisation</strong><br>QEMU · VMware · VirtualBox
</div>

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Pentest</strong><br>Nmap · Burp Suite · Wireshark · Metasploit
</div>

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>CTI</strong><br>YARA · MITRE ATT&CK
</div>

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Systèmes</strong><br>Linux · Windows
</div>

</div>
{{< /rawhtml >}}

---

## Expérience

{{< timeline >}}

{{< timelineItem icon="code" header="Stage en reverse engineering — eShard" badge="Mars – Août 2025" subheader="Pessac, France" >}}
Implémentation, détection et contournement de techniques anti-émulation pour Windows. Travail sur le Time Travel Debugging (TTD) Reven en émulation système complète.
<ul>
  <li>Implémentation de nombreuses techniques anti-VM (CPUID, RDTSC, Windows API, ...) en assembleur x86 et C</li>
  <li>Conception d'un pipeline de génération automatisée de binaires intégrant des techniques anti-VM, utilisé pour valider les détections</li>
  <li>Reverse engineering de binaires et d'échantillons malveillants pour identifier des marqueurs anti-émulation (Ghidra, Binary Ninja)</li>
  <li> Automatisation de la détection de comportements suspects via des scripts TTD (Python)</li>
  <li>Contournement des protections anti-VM par patch d'APIs Windows (WinDbg) et modification de configurations QEMU</li>
  <li>Création de contenu de vulgarisation : playlist YouTube et article technique publié sur le blog d'eShard</li>
  <li>Documentation des travaux sous Jupyter Notebook</li>
</ul>
{{< /timelineItem >}}

{{< /timeline >}}

---

## Formation

{{< timeline >}}

{{< timelineItem icon="graduation-cap" header="Master Cryptologie & Sécurité Informatique" badge="2023 – 2025" subheader="Université de Bordeaux" >}}
<a href="https://mastercsi.labri.fr" target="_blank">mastercsi.labri.fr</a>
<br><br>
<table>
  <thead><tr><th>Semestre</th><th>Matières</th></tr></thead>
  <tbody>
    <tr><td>S7</td><td>Arithmétique · Programmation · Calcul Formel · Algèbre linéaire · Systèmes d'exploitation</td></tr>
    <tr><td>S8</td><td>Cryptologie · Sécurité des logiciels · Théorie de l'information · Théorie de la Complexité · Programmation des architectures parallèles</td></tr>
    <tr><td>S9</td><td>Cryptanalyse · Post Quantum Cryptography · Cartes à puce · Sécurité des réseaux · Sécurité des systèmes</td></tr>
    <tr><td>S10</td><td>Stage en entreprise</td></tr>
  </tbody>
</table>
{{< /timelineItem >}}

{{< timelineItem icon="graduation-cap" header="Licence Mathématiques & Informatique" badge="2020 – 2023" subheader="Université de Bordeaux" >}}
{{< /timelineItem >}}

{{< /timeline >}}

---

## Certifications

{{< timeline >}}

{{< timelineItem icon="shield" header="BTL1 – Blue Team Level 1" badge="En cours" subheader="Security Blue Team" >}}
{{< badge >}}En cours{{< /badge >}}
{{< /timelineItem >}}

{{< /timeline >}}

---

## CTF & Compétitions

| Année | Compétition | Classement |
|---|---|---|
| 2025 | TUCTF | {{< badge >}}208e{{< /badge >}} |
| 2024 | EKOPARTY CTF | {{< badge >}}18e{{< /badge >}} |
| 2024 | HKCERT CTF | {{< badge >}}94e{{< /badge >}} |
| 2024 | 1337UP Live CTF | {{< badge >}}189e{{< /badge >}} |

---

## Contact

{{< rawhtml >}}
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin:1.5rem 0">

<a href="mailto:ec.charbonnier@gmail.com" style="text-decoration:none;color:inherit">
<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem;display:flex;align-items:center;gap:0.75rem">
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
<div><strong>Email</strong><br><small>ec.charbonnier@gmail.com</small></div>
</div></a>

<a href="https://github.com/HalfTimeOfLife" target="_blank" style="text-decoration:none;color:inherit">
<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem;display:flex;align-items:center;gap:0.75rem">
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
<div><strong>GitHub</strong><br><small>HalfTimeOfLife</small></div>
</div></a>

<a href="https://linkedin.com/in/elouan-charbonnier" target="_blank" style="text-decoration:none;color:inherit">
<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem;display:flex;align-items:center;gap:0.75rem">
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
<div><strong>LinkedIn</strong><br><small>elouan-charbonnier</small></div>
</div></a>

<a href="https://www.root-me.org/Azralt" target="_blank" style="text-decoration:none;color:inherit">
<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem;display:flex;align-items:center;gap:0.75rem">
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a9 9 0 0 1 9 9c0 3.3-1.8 6.2-4.4 7.8V21a1 1 0 0 1-1 1H8.4a1 1 0 0 1-1-1v-2.2C4.8 17.2 3 14.3 3 11a9 9 0 0 1 9-9z"/><path d="M9 17v1"/><path d="M15 17v1"/><path d="M9 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/><path d="M15 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>
<div><strong>RootMe</strong><br><small>Azralt</small></div>
</div></a>

</div>
{{< /rawhtml >}}