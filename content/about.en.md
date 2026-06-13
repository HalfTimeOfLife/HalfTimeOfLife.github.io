---
title: "About"
showDate: false
showReadingTime: false
showWordCount: false
---

{{< lead >}}
Master's graduate in Cryptology and Computer Security, specialising in reverse engineering and malware analysis.
{{< /lead >}}

{{< button href="/assets/cv_en.pdf" target="_blank" >}}
Download my resume
{{< /button >}}

---

## Technical Skills

{{< rawhtml >}}
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin:1.5rem 0">

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Languages</strong><br>Python · C · x86/x64 Assembly · LaTeX
</div>

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Static Analysis</strong><br>Ghidra · Binary Ninja
</div>

<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:0.75rem;padding:1rem">
<strong>Dynamic Analysis</strong><br>GDB · WinDbg · Reven TTD
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
<strong>Systems</strong><br>Linux · Windows
</div>

</div>
{{< /rawhtml >}}

---

## Experience

{{< timeline >}}

{{< timelineItem icon="code" header="Reverse Engineering Internship — eShard" badge="March – August 2025" subheader="Pessac, France" >}}
Implementation, detection and bypass of anti-emulation techniques for Windows. Work on Time Travel Debugging (TTD) Reven in full system emulation.
<ul>
  <li>Implemented a wide range of anti-VM techniques (CPUID, RDTSC, Windows API, ...) in x86 assembly and C</li>
  <li>Designed an automated binary generation pipeline embedding anti-VM techniques, used to validate detection coverage</li>
  <li>Reverse-engineered binaires and malware samples to identify anti-emulation markers (Ghidra, Binary Ninja)</li>
  <li>Automated detection of suspicious behaviours through TTD scripting (Python)</li>
  <li>Bypassed anti-VM protections via Windows API patching (WinDbg) and QEMU configuration tuning</li>
  <li>Produced educational content (YouTube playlist) and a technical article published on eShard's blog</li>
  <li>Documented all research under Jupyter Notebooks</li>
</ul>
{{< /timelineItem >}}

{{< /timeline >}}

---

## Education

{{< timeline >}}

{{< timelineItem icon="graduation-cap" header="Master's in Cryptology & Computer Security" badge="2023 – 2025" subheader="University of Bordeaux" >}}
<a href="https://mastercsi.labri.fr" target="_blank">mastercsi.labri.fr</a>
<br><br>
<table>
  <thead><tr><th>Semester</th><th>Courses</th></tr></thead>
  <tbody>
    <tr><td>S7</td><td>Arithmetic · Programming · Formal Computation · Linear Algebra · Operating Systems</td></tr>
    <tr><td>S8</td><td>Cryptology · Software Security · Information Theory · Complexity Theory · Parallel Architecture Programming</td></tr>
    <tr><td>S9</td><td>Cryptanalysis · Post Quantum Cryptography · Smart Cards · Network Security · System Security</td></tr>
    <tr><td>S10</td><td>Industry internship</td></tr>
  </tbody>
</table>
{{< /timelineItem >}}

{{< timelineItem icon="graduation-cap" header="Bachelor's in Mathematics & Computer Science" badge="2020 – 2023" subheader="University of Bordeaux" >}}
{{< /timelineItem >}}

{{< /timeline >}}

---

## Certifications

{{< timeline >}}

{{< timelineItem icon="shield" header="BTL1 – Blue Team Level 1" badge="In progress" subheader="Security Blue Team" >}}
{{< badge >}}In progress{{< /badge >}}
{{< /timelineItem >}}

{{< /timeline >}}

---

## CTF & Competitions

| Year | Competition | Rank |
|---|---|---|
| 2025 | TUCTF | {{< badge >}}208th{{< /badge >}} |
| 2024 | EKOPARTY CTF | {{< badge >}}18th{{< /badge >}} |
| 2024 | HKCERT CTF | {{< badge >}}94th{{< /badge >}} |
| 2024 | 1337UP Live CTF | {{< badge >}}189th{{< /badge >}} |

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