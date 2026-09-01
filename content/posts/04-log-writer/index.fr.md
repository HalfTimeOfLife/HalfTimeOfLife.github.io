---
title: "04 - Écriture des événements sur disque : journalisation JSONL, événements de réveil et premier crash"
date: 2026-09-01
draft: false
description: "Écriture des logs sur disque et premier crash noyau du driver KDAMonitor."
summary: "Écriture des logs sur disque et premier crash noyau du driver KDAMonitor."
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Bienvenue dans le quatrième article de la série sur le développement de KDAMonitor !

Dans cet article, je vais couvrir la version v0.4 de ce projet ainsi que le premier crash rencontré dans ce dernier. La version v0.4 est consacrée avant tout à l'implémentation de la journalisation via des fichiers `.jsonl`. Cette journalisation permettra de donner un sens à la file implémentée précédemment. 

Voici les fichiers concernés par cet article, et la section qui les explique :

| Fichier | Rôle | Section |
| --- | --- | --- |
| `kdamon_config.h` | Nouvelles constantes centralisées (chemins de log) | [Pourquoi un thread dédié à l'écriture ?](#pourquoi-un-thread-dédié-à-lécriture-) |
| `log_writer.h` | Interface publique du log writer (`Start`/`Stop`) | [Le thread dédié à l'écriture (`log_writer.c`)](#le-thread-dédié-à-lécriture-log_writerc) |
| `log_writer.c` | Ouverture/fermeture du fichier, sérialisation JSONL, thread, contrôleurs start/stop | [Le thread dédié à l'écriture (`log_writer.c`)](#le-thread-dédié-à-lécriture-log_writerc) / [Journalisation au format JSONL](#journalisation-au-format-jsonl) |
| `event_queue.c` | Ajout de `WakeEvent` dans `KDAMON_EVENT_QUEUE`, signalisation dans `Push`, nouveau getter | [Événements de réveil](#événements-de-réveil) |
| `driver_entry.c` | Retrait du code de test, câblage `KdaMonLogWriterStart`/`Stop` | [Intégration dans `driver_entry.c`](#intégration-dans-driver_entryc) |
| `docs/crashes.md` | Documentation du crash #1 | [Le premier crash : `IRQL_NOT_LESS_OR_EQUAL (0xA)`](#le-premier-crash--irql_not_less_or_equal-0xa) |

> Le projet peut être retrouvé dans ce dépôt : [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## Pourquoi un thread dédié à l'écriture ?

Il y a deux raisons à faire un thread dédié à l'écriture et ne pas compter sur les callbacks : 
1. Cela permet de répartir clairement ce que chaque objet créé (device, queue, ...) doit faire, sans mettre trop de responsabilité sur un seul.
2. Éviter les parties lentes et bloquantes concernant le fichier (ouverture puis écriture). Plus de détails dans la partie suivante.

### Le problème du couplage producteur/consommateur

Ce que j'appelle un producteur (ou fournisseur) seront les callbacks qui seront bientôt implémentés. Chacun de ces callbacks va fournir des événements à la file, lorsqu'il vont rajouter les événements à la file ils vont s'exécuter à `DISPATCH_LEVEL`. Cependant, à `DISPATCH_LEVEL` le *scheduler* ne peut intervenir, c'est-à-dire qu'aucune I/O bloquante n'est autorisée (pas de lecture/écriture disque, pas d'attente sur un objet qui peut dormir).

Pour résoudre ce problème, il faut un nouvel object qui sera dédié à cela. Ainsi, oute la partie lente et bloquante (ouvrir un fichier, écrire dedans) est déportée dans un thread système séparé, qui lui tourne à `PASSIVE_LEVEL`.

### Nouvelles constantes centralisées (`kdamon_config.h`)

C'est le bon moment pour introduire les nouvelles constantes :

- `KDAMON_DIR`: Le chemin du dossier attribué au driver (tout le projet) `L"\\??\\C:\\KDAMonitor\\"`.
- `KDAMON_LOG_DIR`: Le chemin du dossier attribué au journaux du driver `L"\\??\\C:\\KDAMonitor\\logs\\"`.
- `KDAMON_LOG_FILE_PREFIX` et `KDAMON_LOG_FILE_EXTENSION`: Respectivement, le préfixe et suffixe donnés au fichier de log.

Pourquoi cette notation `\??\C:\` ?

Ce lien symbolique appartient à l'espace de noms objets du noyau (*Object Manager namespace*) ; il permet de faire le pont vers le disque `C:`, une notion propre à l'espace Win32 que cet espace de noms objets ne connaît pas nativement.

> `\??\` est aussi appelé `\DosDevices\`.

Dans cette version, `kdamon_config.h` reçoit aussi une correction de compilation à cette occasion : les identifiants `STATUS_*` (utilisés entre autres par `ZwCreateFile`) n'étaient pas déclarés. Il faut inclure `<ntstatus.h>` avant `<ntddk.h>`, en définissant `WIN32_NO_STATUS` entre les deux pour éviter les conflits de macros, voici le fichier final :

```c
#pragma once

#include <ntstatus.h>
#define WIN32_NO_STATUS
#include <ntddk.h>
#undef WIN32_NO_STATUS

#define DRIVER_TAG "[KDAMonitor]"

#define KDAMON_DEVICE_NAME L"\\Device\\KDAMonitor"
#define KDAMON_SYMLINK_NAME L"\\DosDevices\\KDAMonitor"

#define KDAMON_DIR L"\\??\\C:\\KDAMonitor\\"
#define KDAMON_LOG_DIR L"\\??\\C:\\KDAMonitor\\logs\\"
#define KDAMON_LOG_FILE_PREFIX L"kdamon_"
#define KDAMON_LOG_FILE_EXTENSION L".jsonl"
```

---

## Événements de réveil

### Le problème du polling

- Sans mécanisme de réveil, le thread devrait interroger la file en boucle pour savoir si de nouveaux événements sont arrivés → CPU gaspillé, latence.

### Le `WakeEvent` ajouté à `KDAMON_EVENT_QUEUE`

- Nouveau champ `KEVENT WakeEvent` dans la structure de la file (`event_queue.c`), de type `SynchronizationEvent`.
- Dans `KdaMonEventQueuePush`, juste avant de relâcher le spinlock : `KeSetEvent(&g_EventQueue.WakeEvent, IO_NO_INCREMENT, FALSE)` — donc signalé **à chaque push réussi**, sous spinlock, à `DISPATCH_LEVEL`.
  - Point à expliciter : `KeSetEvent` est justement conçu pour pouvoir être appelé jusqu'à `DISPATCH_LEVEL`, contrairement à des primitives d'attente côté appelant — cohérent avec le choix du spinlock de l'article 03.
- Nouveau getter `KdaMonEventQueueGetWakeEvent` exposé dans `event_queue.h`, utilisé par `log_writer.c` pour récupérer le pointeur vers cet événement sans exposer toute la structure de la file.

### Distinction avec l'événement d'arrêt

- Bien préciser qu'il y a **deux événements distincts** : `WakeEvent` (porté par la file, signalé à chaque nouvel événement) et `g_StopEvent` (local à `log_writer.c`, signalé une seule fois à l'arrêt). Le thread attend les deux en même temps via `KeWaitForMultipleObjects`, ce qui lui permet de réagir immédiatement à l'arrêt sans attendre un hypothétique prochain événement.

---

## Le thread dédié à l'écriture (`log_writer.c`)

Avant de continuer dans cette partie, je vais présenter certaines fonctions qui ne seront pas détaillées dans cet article :

- `KdaMonLogWriterOpenFile` s'occupe de créer (ou vérifier l'existence de) `C:\KDAMonitor\`, puis `C:\KDAMonitor\logs\`, puis construire un nom de fichier horodaté (`kdamon_YYYYMMDD_HHMMSS.jsonl`) et l'ouvrir en écriture.
- `KdaMonLogWriterCloseFile` ferme le handle du fichier de log s'il est ouvert (`ZwClose`), puis le remet à `NULL`.

La fonction `KdaMonLogWriterWriteEvent` écrit une ligne dans le fichier `.jsonl` représentant un événement et sera détaillée dans la section [Journalisation au format JSONL](#journalisation-au-format-jsonl).

> Sans callbacks implémentés, cette fonction va écrire un événement basique, sans informations pertinentes. L'événement contiendra : l'ID, le type d'événement et le timestamp.

De plus, voici l'état global maintenu par ce module :

- `g_ThreadObject` : le pointeur vers l'objet thread noyau, conservé pour pouvoir l'attendre à l'arrêt (voir plus bas).
- `g_StopEvent` : l'événement signalé pour demander l'arrêt du thread.
- `g_LogFileHandle` : le handle vers le fichier de log actuellement ouvert.

Un dernier objet est utilisé mais ne fait pas partie de ce module : le `WakeEvent`, dans la structure de la file d'événements elle-même (`event_queue.c`) et signalé à chaque `Push`. Son fonctionnement complet a été détaillé dans la section [Événements de réveil](#événements-de-réveil), juste avant.

### Création du thread : `IoCreateSystemThread`

Commençons par la fonction qui va nous permettre de lancer le thread dédié au journaliseur, `KdaMonLogWriterStart`.

Elle commence par initialiser `g_StopEvent` en tant que `NotificationEvent`, qui va nous permettre de réveiller le thread en attente :

```c
KeInitializeEvent(&g_StopEvent, NotificationEvent, FALSE);
```

`NotificationEvent` signifie qu'une fois signalé, l'événement reste signalé indéfiniment. Une fois l'arrêt demandé, il ne doit pas "s'auto-consommer", il doit rester signalé de façon permanente. Le dernier paramètre, `FALSE`, fixe l'état initial à non-signalé.

Ensuite, la fonction vérifie que le fichier de log existe puis l'ouvre (`KdaMonLogWriterOpenFile`). Juste après, on crée le thread système avec `IoCreateSystemThread` :

```c
    status = IoCreateSystemThread(
        DriverObject,               // Objet driver auquel associer le thread
        &threadHandle,              // Un handle vers le thread (en sortie)
        THREAD_ALL_ACCESS,          // Le masque de droits demandé sur ce handle
        NULL,                       // ObjectAttributes 
        NULL,                       // ProcessHandle 
        NULL,                       // ClientId 
        KdaMonLogWriterThread,      // La routine d'entrée du thread
        NULL                        // StartContext
    );
```

Le premier paramètre, `DriverObject`, est ce qui distingue cette fonction de `PsCreateSystemThread`. En le passant ici, l'I/O Manager associe le thread créé au driver et incrémente un compteur interne de threads actifs pour ce driver. Concrètement, cela empêche Windows de décharger le driver tant que ce compteur n'est pas revenu à zéro, ou autrement dit, tant que le thread tourne encore. Cela rajoute une couche de protection sur un déchargement prématuré que `PsCreateSystemThread` n'offre pas nativement.

Les paramètres suivants sont laissés à NULL : 
- `ObjectAttributes` : pas de nom d'objet à associer
- `ProcessHandle` : le thread est créé dans le contexte du processus System par défaut 
- `ClientId` : on n'a pas besoin de récupérer son PID/TID puisqu'on va travailler directement avec un pointeur d'objet (voir plus bas).

`KdaMonLogWriterThread` est la routine d'entrée du thread (voir [Boucle principale du thread (`KdaMonLogWriterThread`)](#boucle-principale-du-thread-kdamonlogwriterthread)). `StartContext` reste NULL : elle n'a besoin de rien recevoir en paramètre, elle récupère elle-même le `WakeEvent` de la file.

En cas d'échec à cette étape, la fonction appelle `KdaMonLogWriterCloseFile`. 

Voici le code final de cette fonction :

```c
BOOLEAN KdaMonLogWriterStart(_In_ PDRIVER_OBJECT DriverObject)
{
    NTSTATUS status;
    HANDLE threadHandle;

    KeInitializeEvent(&g_StopEvent, NotificationEvent, FALSE);

    status = KdaMonLogWriterOpenFile();
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: KdaMonLogWriterStart: failed to open log file (0x%08X)\n", status));
        return FALSE;
    }

    status = IoCreateSystemThread(
        DriverObject,
        &threadHandle,
        THREAD_ALL_ACCESS,
        NULL,
        NULL,
        NULL,
        KdaMonLogWriterThread,
        NULL
    );
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: IoCreateSystemThread failed (0x%08X)\n", status));
        KdaMonLogWriterCloseFile();
        return FALSE;
    }

    status = ObReferenceObjectByHandle(
        threadHandle,
        THREAD_ALL_ACCESS,
        NULL,
        KernelMode,
        &g_ThreadObject,
        NULL
    );
    ZwClose(threadHandle);
    if (!NT_SUCCESS(status))
    {
        KdPrint((DRIVER_TAG " [ERROR]: ObReferenceObjectByHandle failed (0x%08X)\n", status));
        return FALSE;
    }


    KdPrint((DRIVER_TAG " [SUCCESS]: Log writer started\n"));
    return TRUE;
}
```

### Boucle principale du thread (`KdaMonLogWriterThread`)

Une fois lancé par `IoCreateSystemThread`, le thread exécute `KdaMonLogWriterThread` en boucle jusqu'à ce qu'on lui demande de s'arrêter :

```c
static VOID KdaMonLogWriterThread(_In_ PVOID StartContext)
{
    UNREFERENCED_PARAMETER(StartContext);

    PRKEVENT WakeEvent = KdaMonEventQueueGetWakeEvent();
    PVOID WaitObjects[WAIT_OBJECT_COUNT];
    NTSTATUS WaitStatus;
    KDAMON_EVENT Event;


    WaitObjects[0] = &g_StopEvent;
    WaitObjects[1] = WakeEvent;

    KdPrint((DRIVER_TAG " [SUCCESS]: Log writer thread started\n"));

    for (;;) {
        WaitStatus = KeWaitForMultipleObjects(
            WAIT_OBJECT_COUNT,
            WaitObjects,
            WaitAny,
            Executive,
            KernelMode,
            FALSE,
            NULL,
            NULL
        );

        if (WaitStatus == STATUS_WAIT_0)
        {
            break;
        }

        while (KdaMonEventQueuePop(&Event))
        {
            KdaMonLogWriterWriteEvent(&Event);
        }
    }

    KdPrint((DRIVER_TAG " [SUCCESS]: Log writer thread exiting\n"));

    PsTerminateSystemThread(STATUS_SUCCESS);
}
```

Le thread récupère d'abord le champ `WakeEvent` de la file via `KdaMonEventQueueGetWakeEvent` (voir [Événements de réveil](#événements-de-réveil)). Ensuite, il place ces deux objets dans un tableau (`WaitObjects`) : `g_StopEvent` en index 0 et le `WakeEvent` en index 1.

La boucle `for (;;)` attend ensuite sur ces deux objets simultanément avec `KeWaitForMultipleObjects` en mode `WaitAny`. Ce mode permet au thread de se mettre en sommeil et de se réveiller dès que **l'un des deux** objets est signalé.

La valeur de retour est utilisée pour déterminer le comportement que doit adopter le code : 
- Si la valeur de retour est `STATUS_WAIT_0`, alors cela correspond à l'index 0 de `WaitObjects` et donc l'objet signalé est `g_StopEvent`. Si c'est le cas, la boucle est immédiatement interrompue.
- Dans tous les autres cas, le thread vide entièrement la file via la boucle `while (KdaMonEventQueuePop(&Event))` qui retire et écrit, via `KdaMonLogWriterWriteEvent`, les événements un par un, jusqu'à ce que la file soit vide, avant de retourner attendre le prochain réveil.

Une fois sorti de la boucle principale, `PsTerminateSystemThread(STATUS_SUCCESS)` termine le thread.

### Cycle de vie et arrêt propre

L'arrêt du thread se fait via `KdaMonLogWriterStop`, appelée depuis `DriverUnload`, avant `KdaMonEventQueueDestroy` :

```c
VOID KdaMonLogWriterStop(VOID)
{
    if (g_ThreadObject == NULL) {
        return;
    }

    KeSetEvent(&g_StopEvent, IO_NO_INCREMENT, FALSE);

    KeWaitForSingleObject(g_ThreadObject, Executive, KernelMode, FALSE, NULL);

    ObDereferenceObject(g_ThreadObject);
    g_ThreadObject = NULL;

    KdaMonLogWriterCloseFile();

    KdPrint((DRIVER_TAG " [SUCCESS]: Log writer stopped\n"));
}
```

`KeSetEvent(&g_StopEvent, ...)` signale l'arrêt, le thread en attente dans `KeWaitForMultipleObjects` se réveille avec `STATUS_WAIT_0` et sort de sa boucle.

En utilisant `KeWaitForSingleObject(g_ThreadObject, ...)`, un objet thread passe à l'état signalé exactement quand le thread se termine réellement (au moment du `PsTerminateSystemThread`). Cet appel bloque donc jusqu'à ce que le thread ait fini de s'exécuter, pas seulement jusqu'à ce qu'on le lui ait demandé. Sans cette attente, `DriverUnload` pourrait continuer, et le driver être déchargé, pendant que le thread tourne encore.

Une fois le thread garanti terminé, `ObDereferenceObject` relâche la référence prise dans `KdaMonLogWriterStart`, et `g_ThreadObject` est remis à `NULL`. Enfin, `KdaMonLogWriterCloseFile` ferme le fichier de log.

---

## Journalisation au format JSONL

### Pourquoi JSONL ?

Le format JSONL (*JSON Lines*) consiste à écrire un objet JSON valide par ligne, plutôt qu'un unique tableau JSON englobant l'ensemble des événements. J'ai choisi ce format pour deux raisons :
1. chaque événement peut être écrit indépendamment en simple append, sans avoir à réécrire ou refermer une structure englobante
2. la correspondance stricte "une ligne = un événement" rend le fichier trivial à parser ensuite.

> Un autre point qui a justifié ce choix que j'ai découvert après est que si le processus est interrompu brutalement (crash, arrêt forcé), les lignes déjà écrites restent exploitables telles quelles.

### Sérialisation d'un événement (`KdaMonLogWriterWriteEvent`)

Dans cette partie, le format donné sera la sérialisation de base commune à tous les types d'événements. La construction de la ligne JSON est faite avec `RtlStringCbPrintfA` : 

```
{"id":...,"type":"...","timestamp":...}\n
```

Dans le code cela donne :

```c
    NTSTATUS status = RtlStringCbPrintfA(
        EventBuffer,
        sizeof(EventBuffer),
        "{\"id\":%lu,\"type\":\"%s\",\"timestamp\":%lld}\n",
        Event->Id,
        KdaMonEventTypeToString(Event->Type),
        Event->Timestamp.QuadPart
    );
```

> `KdaMonEventTypeToString` : petite fonction de mapping de l'enum `KDAMON_EVENT_TYPE` vers une chaîne lisible (`"Process"`, `"Network"`, etc.).

`RtlStringCbPrintfA` est utilisée à la place d'un `sprintf` classique. C'est une fonction de la bibliothèque *safe strings* du noyau (`ntstrsafe.h`), qui prend explicitement la taille du buffer de destination (`sizeof(EventBuffer)`) et garantit de ne jamais écrire au-delà.

Une fois la ligne construite, sa longueur exacte est récupérée avec `RtlStringCbLengthA` :

```c
    status = RtlStringCbLengthA(EventBuffer, sizeof(EventBuffer), &Length);
```

Cette longueur (sans le `\0` final) est nécessaire pour indiquer à `ZwWriteFile` combien d'octets écrire précisément :

```c
    status = ZwWriteFile(
        g_LogFileHandle,
        NULL,             // Event
        NULL,             // ApcRoutine
        NULL,             // ApcContext
        &IoStatusBlock,
        EventBuffer,
        (ULONG)Length,
        NULL,             // ByteOffset
        NULL              // Key
    );
```

`ZwWriteFile` est l'équivalent noyau de `WriteFile`. Elle écrit dans le fichier, on utilise le handle du fichier de log : `g_LogFileHandle`. Les paramètres `Event` et `ApcRoutine` laissés à `NULL` ne sont pas utilisés ici. L'appel est synchrone, grâce au flag `FILE_SYNCHRONOUS_IO_NONALERT` posé lors de l'ouverture du fichier. `IoStatusBlock` reçoit en sortie le nombre d'octets réellement écrits ainsi que le statut de l'opération.

> Le code de cette fonction ne sera pas donné en entier car ce n'est qu'un prototype qui sera remplacé par les fonctions de remplissage attribuées aux callbacks. Il peut cependant être trouvé dans la release v0.4 du projet : [v0.4 - Log Writer](https://github.com/HalfTimeOfLife/KDAMonitor/releases/tag/v0.4).


---

## Intégration dans `driver_entry.c`

Tout d'abord, il faut rajouter le lancement du log writer (`KdaMonLogWriterStart`) dans `DriverEntry` et son arrêt (`KdaMonLogWriterStop`) dans `DriverUnload` :

```c
void DriverUnload(_In_ PDRIVER_OBJECT DriverObject)
{
        UNREFERENCED_PARAMETER(DriverObject);

	KdaMonLogWriterStop();
	KdaMonEventQueueDestroy();
	KdaMonDeleteDevice(g_DeviceObject);
	KdPrint((DRIVER_TAG " [SUCCESS]: Driver Unload called\n"));
}

NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
    ...
	
	if (!KdaMonEventQueueInitialize())
	{
		KdPrint((DRIVER_TAG " [ERROR]: EventQueueInitialize failed\n"));
		return STATUS_UNSUCCESSFUL;
	}
	if (!KdaMonLogWriterStart(DriverObject))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonLogWriterStart failed\n"));
		return STATUS_UNSUCCESSFUL;
	}

	KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));

    ...

	return STATUS_SUCCESS;
}
```

Ensuite, on va rajouter dans `DriverEntry` un test tout simple : on va créer 2 événements et les ajouter à la file. Si notre log writer fonctionne parfaitement, les événements devraient être retirés de la file dans l'ordre d'arrivée et écrits dans un fichier `.jsonl`. Ci-dessous le code final de `DriverEntry` :

```c
NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
	UNREFERENCED_PARAMETER(RegistryPath);

	DriverObject->DriverUnload = DriverUnload;
	DriverObject->MajorFunction[IRP_MJ_CREATE] = KdaMonCreateClose;
	DriverObject->MajorFunction[IRP_MJ_CLOSE] = KdaMonCreateClose;
	DriverObject->MajorFunction[IRP_MJ_DEVICE_CONTROL] = KdaMonDeviceControl;

	NTSTATUS status = KdaMonCreateDevice(DriverObject, &g_DeviceObject);
	if (!NT_SUCCESS(status))
	{
		return status;
	}
	
	if (!KdaMonEventQueueInitialize())
	{
		KdPrint((DRIVER_TAG " [ERROR]: EventQueueInitialize failed\n"));
		return STATUS_UNSUCCESSFUL;
	}
	if (!KdaMonLogWriterStart(DriverObject))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonLogWriterStart failed\n"));
		return STATUS_UNSUCCESSFUL;
	}

	KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));

	// --- BEGIN TEST QUEUE ---
	KDAMON_EVENT testEvent1 = { 0 };
	testEvent1.Type = KdaMonEventProcess;
	KeQuerySystemTimePrecise(&testEvent1.Timestamp);
	KdaMonEventQueuePush(&testEvent1);

	KDAMON_EVENT testEvent2 = { 0 };
	testEvent2.Type = KdaMonEventNetwork;
	KeQuerySystemTimePrecise(&testEvent2.Timestamp);
	KdaMonEventQueuePush(&testEvent2);
	// --- END TEST QUEUE ---

	return STATUS_SUCCESS;
}
```

> Contrairement au test de l'article 03, on ne dépile plus manuellement : c'est le thread de log qui va consommer ces deux événements de lui-même, dès qu'il sera réveillé par le `WakeEvent`.

Voici une démonstration de ce test en exécution :

<video controls width="100%">
  <source src="demo-log-writer.mp4" type="video/mp4">
</video>

---

## Le premier crash : `IRQL_NOT_LESS_OR_EQUAL (0xA)`

### Contexte

La VM a produit un **BSOD** (*Blue Screen Of Death*). Le dump généré à la suite du crash (trouvé dans `C:\Windows\Minidump\`) a été conservé dans le dossier `docs/dumps/` du dépôt et analysé avec WinDbg (`!analyze -v`).

Le bugcheck relevé est `IRQL_NOT_LESS_OR_EQUAL (0xA)` :

```
IRQL_NOT_LESS_OR_EQUAL (a)
An attempt was made to access a pageable (or completely invalid) address at an
interrupt request level (IRQL) that is too high.  This is usually
caused by drivers using improper addresses.
If a kernel debugger is available get the stack backtrace.
Arguments:
Arg1: 0000000000000000, memory referenced
Arg2: 0000000000000002, IRQL
Arg3: 0000000000000000, bitfield :
	bit 0 : value 0 = read operation, 1 = write operation
	bit 3 : value 0 = not an execute operation, 1 = execute operation (only on chips which support this level of status)
Arg4: fffff807cdc7274f, address which referenced memory
```

`Arg1` confirme que l'adresse mémoire référencée était `NULL`, et `Arg2` confirme un IRQL de 2, soit `DISPATCH_LEVEL`.

L'instruction fautive elle-même se trouve dans `nt!KeSetEvent` :

```
IP_IN_PAGED_CODE: 
nt!KeSetEvent+1af
fffff807`cdc7274f 4d8b2424        mov     r12,qword ptr [r12]
```

Et la pile d'appel confirme le point d'entrée dans le driver :

```
STACK_TEXT:  
fffffb8a`2cac8338 fffff807`ce0bece9     : 00000000`0000000a 00000000`00000000 00000000`00000002 00000000`00000000 : nt!KeBugCheckEx
fffffb8a`2cac8340 fffff807`ce0b9fa8     : 00000000`00000000 00000000`00000000 fffff807`6496d0c0 00000000`00000000 : nt!KiBugCheckDispatch+0x69
fffffb8a`2cac8480 fffff807`cdc7274f     : fffffb8a`00000003 fffff807`cdccb2ba 00000000`00000000 00000000`00000000 : nt!KiPageFault+0x468
fffffb8a`2cac8610 fffff807`6496162c     : ffffbf82`00000000 00000000`00000000 00000001`89e45800 00000001`8521b4e3 : nt!KeSetEvent+0x1af
fffffb8a`2cac86a0 ffffbf82`00000000     : 00000000`00000000 00000001`89e45800 00000001`8521b4e3 ffffffff`80003500 : KDAMonitor+0x162c
fffffb8a`2cac86a8 00000000`00000000     : 00000001`89e45800 00000001`8521b4e3 ffffffff`80003500 ffffbf82`ee180000 : 0xffffbf82`00000000
```

`KDAMonitor+0x162c` correspond à l'appel à `KeSetEvent` fait dans `KdaMonEventQueuePush` (`event_queue.c`), donc juste après l'ajout d'un nouvel événement à la file.

### Diagnostic

Le code fautif se trouvait dans `KdaMonEventQueueInitialize` :

```c
BOOLEAN KdaMonEventQueueInitialize(VOID)
{
    // Initialisé AVANT le zéro-out
    KeInitializeEvent(&g_EventQueue.WakeEvent, SynchronizationEvent, FALSE); 

    KeInitializeSpinLock(&g_EventQueue.Lock);

    RtlZeroMemory(&g_EventQueue, sizeof(g_EventQueue)); // <- FAUTIF

    return TRUE;
}
```
Le `RtlZeroMemory` qui suivait `KeInitializeEvent` écrasait toute la structure `g_EventQueue`, y compris ce `WakeEvent` tout juste initialisé, le pointeur devenait `NULL` au lieu de continuer à pointer sur lui-même. Ainsi, l'objet `event` était corrompu avant même d'avoir servi.

Le crash se produit au premier `Push`. C'est `KeSetEvent` qui tente de parcourir cette liste d'attente interne, déréférence le pointeur `NULL` laissé par le zéro-out, et provoque le bugcheck.

### Résolution

Le correctif consiste simplement à inverser l'ordre des opérations :  `RtlZeroMemory` d'abord, initialiser les objets noyau ensuite.

```c
BOOLEAN KdaMonEventQueueInitialize(VOID)
{
    RtlZeroMemory(&g_EventQueue, sizeof(g_EventQueue));

    KeInitializeEvent(&g_EventQueue.WakeEvent, SynchronizationEvent, FALSE);
    KeInitializeSpinLock(&g_EventQueue.Lock);

    return TRUE;
}
```

---

## Conclusion

La v0.4 donne enfin un vrai débouché à la file construite en v0.3 : le thread du log writer va maintenant vider automatiquement la file et écrire les événements récupérés directement dans un fichier `.jsonl`.

La prochaine version, v0.5, viendra enfin remplir la file pour de vrai avec le premier capteur : la création et la destruction de processus.

Merci d'avoir lu jusqu'au bout et à bientôt pour le prochain et cinquième article de cette série : **Premier capteur : surveillance de la création et de la terminaison des processus**.