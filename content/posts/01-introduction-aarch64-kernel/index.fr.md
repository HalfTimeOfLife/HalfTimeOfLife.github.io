---
title: "01 - Introduction à mon kernel AArch64 bare-metal sur QEMU virt"
date: 2026-09-08
draft: false
description: "Introduction au projet de kernel bare-metal AArch64 et à ses objectifs."
summary: "Introduction au projet de kernel bare-metal AArch64 et à ses objectifs."
series: ["AArch64 Bare-Metal Kernel"]
series_order: 1
tags:
  - AArch64
  - ARM
  - Kernel
  - Assembly
---

Bienvenue dans cette nouvelle série de mon blog ! Elle va me servir de journal de développement pour un petit kernel bare-metal en AArch64, écrit intégralement en assembleur et exécuté sur la machine `virt` de QEMU.

> Le projet peut être retrouvé dans ce dépôt : [aarch64-baremetal-kernel](https://github.com/HalfTimeOfLife/aarch64-baremetal-kernel).

---
 
## En quoi consiste ce projet ?

Ce projet est censé être simple, je dois construire un petit kernel capable de :
- démarrer sur une carte virtuelle AArch64 (QEMU `virt`)
- communiquer avec le monde extérieur via UART
- gérer les exceptions et les interruptions
- mettre en place un timer et du multitâche
- et, à terme, ressembler à un (tout petit) système d'exploitation fonctionnel

> Je modère mes attentes concernant ce *système d'exploitation*, je me suis lancé dans ce projet sans vraiment savoir où cela va finir :)

De plus, je ne vais utiliser que de l'assembleur (pas de C).

---
 
## Pourquoi ce projet ?
 
La raison principale qui m'a poussé à faire ce projet est d'apprendre le langage assembleur ARM ainsi que de comprendre en profondeur l'architecture AArch64 et son fonctionnement bas niveau (registres, niveaux d'exception, MMU, etc.).
 
*À noter que la v0.1 est déjà terminée au moment où j'écris cet article : le kernel boot et affiche déjà un message via UART.*
 
---
 
## Environnement cible
 
| | |
|---|---|
| **Émulateur** | QEMU |
| **Machine** | `virt` |
| **Architecture** | AArch64 (ARMv8-A) |
| **CPU** | `cortex-a57` |
| **Langage** | Assembleur AArch64 |
| **Toolchain** | `aarch64-none-elf` |
 
QEMU `virt` expose une carte minimale mais suffisante pour ce projet : de la RAM, un CPU AArch64, et un UART compatible PL011, mappé en MMIO à l'adresse `0x09000000`.
 
---
 
## Prérequis
 
Pour suivre cette série dans de bonnes conditions, je conseille d'avoir déjà quelques notions de base en assembleur (peu importe l'architecture). Aucune connaissance préalable d'AArch64 n'est nécessaire : je pars moi-même de zéro et j'expliquerai chaque instruction utilisée au fur et à mesure.
 
---

## Plan détaillé de développement
 
Voici le roadmap actuel du projet, version par version :
 
| Version | Fonctionnalité |
|---|---|
| v0.1 | Boot et UART |
| v0.2 | Exceptions et interruptions |
| v0.3 | Timer ARM |
| v0.4 | Gestion mémoire et MMU |
| v0.5 | Niveaux d'exception et mode utilisateur |
| v0.6 | Multitâche et ordonnanceur |
| v0.7 | Pilotes et périphériques |
| v1.0 | Système d'exploitation minimal |
 
---
 
## Programme des articles à venir
 
Voici, dans l'ordre, les articles prévus pour cette série :

| Article | Version(s) | Titre | Contenu principal |
| ------: | :--------: | ----- | ----------------- |
| **01** | - | **Introduction** | Présentation du projet, de ses objectifs et de son environnement cible. |
| **02** | **v0.1** | **Premier boot : linker script, pile et premier message UART** | Mise en place du linker script, du code de boot, initialisation de la pile et premier driver UART pour afficher un message. |
| **03** | **v0.2** | **Les exceptions : construire la table de vecteurs** | Construction de la table de vecteurs d'exception, configuration de `VBAR_EL1`, gestion des exceptions synchrones et des IRQ. |
| **04** | **v0.3** | **Mettre en place le timer ARM** | Configuration du timer générique ARM, mise en place des interruptions périodiques et bases du timekeeping. |
| **05** | **v0.4** | **Gérer la mémoire physique et virtuelle** | Mise en place d'un allocateur physique simple, des tables de pages, configuration de la MMU et passage en adressage virtuel. |
| **06** | **v0.5** | **Premier programme en mode utilisateur** | Détection et gestion des niveaux d'exception, transition vers `EL0` et premier programme en mode utilisateur. |
| **07** | **v0.6** | **Faire tourner plusieurs tâches** | Sauvegarde/restauration de contexte, structure de tâche, ordonnanceur round-robin et exécution de plusieurs tâches noyau. |
| **08** | **v0.7** | **Nouveaux pilotes et périphériques** | Amélioration du driver UART, ajout du support GPIO et de périphériques supplémentaires de la machine `virt`. |
| **09** | **v1.0** | **Bilan** | Consolidation de tous les composants précédents en un petit système d'exploitation utilisable. |
 
---

Merci d'avance à toutes celles et ceux qui suivront cette série. Si vous avez des questions, des retours ou simplement envie d'échanger sur le projet, n'hésitez pas à me contacter.
 
À bientôt pour le prochain article, où l'on plongera vraiment dans le code : le boot et le premier driver UART !