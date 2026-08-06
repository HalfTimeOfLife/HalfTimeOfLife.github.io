---
title: "01 - Introduction à KDAMonitor : développer un driver Windows Kernel"
date: 2026-08-05
draft: false
description: "Introduction au projet KDAMonitor et ses objectifs."
summary: "Introduction au projet KDAMonitor et ses objectifs."
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Bienvenue dans cette première série de mon blog ! Elle va servir à la fois d'expérimentation pour mes prochaines séries d'articles et de journal de développement de KDAMonitor.

> Le projet peut être retrouvé dans ce dépôt : [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## En quoi consiste KDAMonitor ?

KDAMonitor est l'abréviation de *Kernel Driver Activity Monitor*; le but de ce projet est de faire ce que fait globalement [Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon) de Microsoft.
Ce projet sera constitué de deux composants :
- Le driver qui va récupérer des événements, les logger dans un fichier `.jsonl` et les envoyer au client. Voici la liste des événements gérés par le driver :
  - création/destruction de processus
  - chargement d'image
  - connexion réseau
  - modification/création/suppression de registres
  - création/suppression de threads
- Le client qui sera une interface (console dans un premier temps) pour l'utilisateur afin qu'il puisse constater en temps réel les événements

Le choix de ces événements est en partie arbitraire, mais il correspond aussi aux bases de ce qu'on regarde en analyse malware : quel processus a été lancé, quelles DLL ont été chargées, avec qui le processus communique sur le réseau, etc.

---

## Pourquoi ce projet ?

Il y a deux raisons principales pour lesquelles j'ai décidé de faire ce projet et pas un autre :

1. Apprendre à développer un driver pour le noyau Windows
2. Développer un outil utile en analyse malware que je peux réutiliser de mon côté (bien que moins bien que [Sysmon](https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon))

Ce projet est issu d'une simple envie d'apprendre et de découvrir quelque chose. Je m'étais dit que pour surveiller une activité système, quoi de mieux qu'un driver noyau qui a la capacité de tout regarder ?

*À noter que, lors de l'écriture de cet article, je suis déjà à la version 0.7 du projet et que donc j'ai déjà un peu de recul sur celui-ci.*

Sans plus tarder, nous allons passer à l'idée de l'architecture que je me suis faite de ce projet au début.

---

## Architecture prévue

À l'issue de ce projet (en v1.0), l'architecture de ce dernier ressemblera à ceci :

![kdamonitor_architecture_final.svg](./kdamonitor_architecture_final.svg)

En résumé :

1. Un événement se produit (processus, image, connexion réseau, etc.).
2. Un capteur (callbacks ou callouts) va capturer cet événement.
3. Le capteur concerné va aussi ajouter cet événement à la file.
4. L'événement est retiré de la file et distribué à deux destinations :
     - le journaliseur (`log writer`), qui l'écrit dans le fichier `.jsonl`
     - le client, pour affichage en temps réel

---

## Technologies utilisées

| | |
|---|---|
| **Langage** | C |
| **IDE / Build** | Visual Studio 2026 |
| **Modèle de driver** | WDM |
| **Environnement de test** | VM Windows 11 (VirtualBox), test signing désactivé |

> Les choix de technologie seront expliqués tout au long de la série.

---

## Prérequis

Afin de correctement suivre cette série, je conseille au lecteur d'avoir une connaissance basique du C et du fonctionnement interne du noyau Windows.
J'apprends en même temps que vous :-), donc j'essaierai de rendre les articles les plus clairs possible.

---

## Plan détaillé de développement

Ci-dessous, un tableau représentant un plan détaillé de chaque release du projet :

| Version | Fichier(s) concerné(s) | Fonctionnalité                                      |
| ------- | ---------------------- | --------------------------------------------------- |
| v0.1    | `driver_entry.c`       | Squelette du driver (chargement/déchargement)       |
| v0.2    | `device.c`, `ioctl.c`  | Device + IOCTL                                      |
| v0.3    | `event_queue.c`        | File d’événements noyau                             |
| v0.4    | `log_writer.c`         | Journalisation                                      |
| v0.5    | `process_callback.c`   | Surveillance de la création/fermeture des processus |
| v0.6    | `image_callback.c`     | Surveillance du chargement des images/DLL           |
| v0.7    | `wfp_session.c`        | Mise en place de la session WFP                     |
| v0.8    | `wfp_callout.c`        | Surveillance des connexions réseau                  |
| v0.9    | `registry_callback.c`  | Surveillance de l’activité du registre              |
| v0.10   | `thread_callback.c`    | Surveillance de la création/fermeture des threads   |
| v0.11   | -                      | Nettoyage de la structure du projet                 |
| v0.12   | `client/`              | Client en mode utilisateur                          |
| v1.0    | -                      | Stabilisation + publication                         |

---

## Programme des articles à venir

> Vous pouvez ignorer cette partie si vous souhaitez découvrir les articles au fur et à mesure que je les écris. Il est aussi possible que ce programme évolue au fil du développement.

Cet article sert d'introduction à la série; je vais maintenant détailler brièvement le contenu des prochains articles. Voici dans l'ordre les articles qui vont sortir ainsi qu'un court descriptif de ce qu'ils contiendront :

| Article | Version(s) | Titre | Contenu principal |
| ------: | :--------: | ----- | ----------------- |
| **02** | **v0.1 – v0.2** | **Fondations du driver : DriverEntry, device et communication IOCTL** | Création du squelette du driver, `DriverEntry`/`DriverUnload`, `DEVICE_OBJECT`, lien symbolique, IOCTL et premier client usermode de test. |
| **03** | **v0.3** | **Conception de la file d'événements : un pipeline générique d'événements noyau** | Conception de la structure d'événement générique, ring buffer, spinlock, file d'attente, FIFO, identifiants uniques et premier test interne. |
| **04** | **v0.4** | **Écriture des événements sur disque : journalisation JSONL, événements de réveil et premier crash** | Implémentation du thread de journalisation, création des fichiers JSONL, utilisation des `KEVENT` pour supprimer le polling, premier crash (IRQL) et sa résolution. |
| **05** | **v0.5** | **Premier capteur : surveillance de la création et de la terminaison des processus** | Utilisation de `PsSetCreateProcessNotifyRoutineEx`, intégration dans le pipeline d'événements, sérialisation JSON et premiers événements réels. |
| **06** | **v0.6** | **Deuxième capteur : suivi du chargement des images et des DLL** | Ajout de `PsSetLoadImageNotifyRoutine`, récupération des informations sur les DLL/EXE chargés, intégration au système existant. |
| **07** | **v0.7** | **Préparation de la surveillance réseau : mise en place de la session WFP** | Présentation de la Windows Filtering Platform, ouverture de la session WFP, création du fournisseur/sous-couche, second crash rencontré et corrections apportées. |
| **08** | **v0.8** | **Surveillance des connexions réseau avec la Windows Filtering Platform** | Développement du callout WFP, interception des connexions réseau sortantes, collecte des PID, adresses IP, ports et protocoles. |
| **09** | **v0.9** | **Surveillance de l'activité du registre avec les callbacks registre** | Mise en œuvre des callbacks registre (`CmRegisterCallbackEx`), surveillance des créations, modifications et suppressions de clés/valeurs. |
| **10** | **v0.10** | **Surveillance de la création et de la terminaison des threads** | Ajout du callback thread (`PsSetCreateThreadNotifyRoutine`), collecte des événements de création et de terminaison des threads. |
| **11** | **v0.11** | **Refactorisation de KDAMonitor : organisation du code pour la scalabilité** | Réorganisation de l'arborescence du projet, séparation des composants, amélioration de la maintenabilité et préparation à l'évolution du projet. |
| **12** | **v0.12** | **Création d'un client usermode pour la surveillance des événements en temps réel** | Développement d'un client console communiquant avec le driver via les IOCTL afin d'afficher les événements en temps réel. |
| **13** | **v1.0** | **KDAMonitor v1.0 : stabilisation, validation et retour d'expérience** | Validation sur des échantillons réels en VM, performances, limites du projet, documentation finale, bilan du développement et perspectives d'évolution. |

---

Merci d'avance à toutes celles et ceux qui suivront cette série. Si vous avez des questions, des retours ou simplement envie d'échanger sur le projet, n'hésitez pas à me contacter par [mail](mailto:ec.charbonnier@gmail.com) ou sur [LinkedIn](https://linkedin.com/in/elouan-charbonnier).

À bientôt pour le prochain article où l'on commencera vraiment à développer le driver !