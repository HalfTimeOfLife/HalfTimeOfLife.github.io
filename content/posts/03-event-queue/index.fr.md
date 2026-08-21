---
title: "03 - La file d'événements : structure et synchronisation dans le noyau"
date: 2026-08-21
draft: false
description: "Construction de la file d'événements du driver KDAMonitor."
summary: "Construction de la file d'événements du driver KDAMonitor."
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Bienvenue dans le troisième article de la série sur le développement de KDAMonitor !

Dans cet article, je vais couvrir la version v0.3 de ce projet. Dans cette version, je me suis contenté d'implémenter la structure de données (en l'occurrence une file) qui va permettre de stocker, transmettre et supprimer les « événements » (voir [Définition d'un événement dans le contexte de KDAMonitor](#définition-dun-événement-dans-le-contexte-de-kdamonitor)) récupérés par les capteurs.

Voici les fichiers concernés par cet article, et la section qui les explique :

| Fichier | Rôle | Section |
| --- | --- | --- |
| `event_types.h` | Types d'événements et structure `KDAMON_EVENT` | [Définition d'un événement dans le contexte de KDAMonitor](#définition-dun-événement-dans-le-contexte-de-kdamonitor) |
| `event_queue.h` | Interface de la file d'événements et déclarations des fonctions | [Implémentation de la file](#implémentation-de-la-file) |
| `event_queue.c` | Implémentation de la file d'événements et synchronisation | [Implémentation de la file](#implémentation-de-la-file) |
| `driver_entry.c` | Point d'entrée du pilote, initialisation de la file d'événements et test | [Exemple : test de la file d'événements](#exemple--test-de-la-file-dévénements) |

> Le projet peut être retrouvé dans ce dépôt : [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## Définition d'un événement dans le contexte de KDAMonitor

Avant d'expliquer en détail la structure de données que j'ai utilisée, voyons ce que je considère comme un événement. Voici comment la structure est définie dans le code :

```c
typedef struct _KDAMON_EVENT
{
    KDAMON_EVENT_TYPE Type;
    LARGE_INTEGER Timestamp;
    ULONG Id;
    // future members for event data
    //union
    //{
    //
    //} Data;
} KDAMON_EVENT, * PKDAMON_EVENT;
```

Commençons par les trois premiers champs de la structure `KDAMON_EVENT` :
- `Type` : Ce champ contiendra une valeur correspondant à un type désigné dans l'enum `KDAMON_EVENT_TYPE`.
- `Timestamp` : L'horodatage de la réception par le callback/callout associé et par la même occasion de la création de l'événement.
- `Id` : Un identifiant unique à la session de capture attribué à l'événement.

> Dans cette version (v0.3), les événements ne contiennent que le `Type`, `Timestamp` et `Id`. De plus, étant donné qu'aucun callback/callout n'est implémenté dans cette version, l'horodatage est fait manuellement.

Le champ `Type` va permettre de distinguer les événements entre eux, voici l'enum qui lui est attribué :

```c
typedef enum _KDAMON_EVENT_TYPE
{
    KdaMonEventImageLoad, // TODO: implemented in v0.6
    KdaMonEventNetwork,   // TODO: implemented in v0.8
    KdaMonEventProcess,   // TODO: implemented in v0.5
    KdaMonEventRegistry,  // TODO: implemented in v0.9
    KdaMonEventThread     // TODO: implemented in v0.10
} KDAMON_EVENT_TYPE;
```

Le dernier champ, qui est une union nommée `Data`, va contenir la structure de l'événement selon le type, rappelons que les événements supportés seront les suivants :
- Création/Destruction de processus
- Chargement d'image
- Connexion réseau
- Création/Suppression/Modification de registre
- Création/Destruction de thread

Chacun de ces types se verra attribuer une structure correspondante avec les infos souhaitées. Les événements auront une base commune mais un bon nombre de détails divergent. Par exemple, pour un événement de chargement d'une dll (qui sera un `KdaMonEventImageLoad`), le chemin de la dll sera récupéré. De la même façon, pour un événement de création de processus, c'est le chemin de l'exécutable qui sera conservé. Par contre, une adresse IP de destination ne concerne que `KdaMonEventNetwork` tout comme un chemin de clef de registre.

> Le contenu spécifique de ces événements (c'est-à-dire les champs des structures correspondantes) sera détaillé dans les articles expliquant chaque capteur associé.

---

## Structure de données utilisée

### Qu'est-ce qu'une file ?

Une file est une structure de données ... qui ressemble à une file :-), plus précisément c'est ce qu'on appelle une structure de données FIFO = First In First Out (Premier Rentré, Premier Sorti), comme dans une file d'attente, le premier arrivé est celui qui passe en premier.

En programmation, une file contient, en pratique, une référence vers le dernier élément ajouté (la queue) et le premier (la tête) dans la file. Ajouter un élément à cette structure signifie que l'on place cet élément à la queue de la file.

Il existe d'autres types de structures de données :
- Une pile, qui est une structure LIFO = Last In First Out, à l'image d'une pile d'assiettes, la dernière mise sur la pile est aussi la première sortie.
- Une liste chaînée (ou une liste) est une structure où il est possible de rajouter des éléments au début, à la fin et au milieu de cette dernière.

On a donc la structure suivante représentant la file :

```c
typedef struct _KDAMON_EVENT_QUEUE
{
    KDAMON_EVENT Buffer[KDAMON_EVENT_QUEUE_SIZE];

    ULONG Head;
    ULONG Tail;
    ULONG Count;

    ULONG DroppedEvents;
    ULONG NextId;

    KSPIN_LOCK Lock;

} KDAMON_EVENT_QUEUE;

static KDAMON_EVENT_QUEUE g_EventQueue;
```

Voici une explication de tous les champs de cette structure :
- `Buffer` : Tableau des événements (`KDAMON_EVENT`) actuellement dans la file
- `Head` : La tête de la file (élément le plus ancien de la file)
- `Tail` : La queue de la file (dernier élément ajouté à la file)
- `Count` : Nombre d'éléments dans la file
- `DroppedEvents` : Nombre d'éléments que la file n'a pas gardés
- `NextId` : ID à attribuer au prochain événement
- `Lock` : Détaillé dans la partie [Synchronisation](#synchronisation)


### Pourquoi utiliser une file ?

Prenons l'exemple suivant :
- On choisit de prendre une pile comme structure de données pour ce projet.
- Un premier événement arrive, on le place en haut de la pile.
- Un deuxième événement arrive, on le place en haut de la pile, au-dessus du premier événement.
- Et ainsi de suite, finalement on arrive à l'événement 1000. Il y a deux scénarios :
    - scénario 1 : on a dépilé (enlevé l'élément en haut de la pile) à chaque fois qu'un événement arrivait -> opération coûteuse, et finalement, quelle différence avec l'absence totale de structure de données ?
    - scénario 2 : on n'a rien dépilé, dans ce cas, le premier élément que l'on va sortir sera en fait le dernier récupéré par les callbacks, ainsi on doit reconstruire via les timestamps la chronologie.

On en déduit que la pile n'est pas un bon choix. D'autant plus que plusieurs callbacks vont alimenter la structure, il nous faut donc une structure qui soit faite pour un ordre chronologique.

La file remplit parfaitement ce rôle. On définit une taille maximale à notre file, et pour chaque événement, on le pousse dans la file (`push`) puis on le retire plus tard depuis la tête de la file (`pop`), dans l'ordre où il a été ajouté. Un désavantage de cette implémentation est le fait que la file a une taille fixe, ce qui veut dire que si trop d'événements arrivent alors que la file est déjà pleine, les nouveaux événements sont rejetés plutôt qu'ajoutés.

Mais que se passe-t-il si deux capteurs rajoutent dans la file en même temps un événement ? Afin de résoudre cela, nous allons faire de la synchronisation.

### Synchronisation

Concrètement, le problème est le suivant :

Le callback réseau et le callback de création de processus rajoutent tous les deux en même temps un événement. Sans protection, les deux pourraient lire la même valeur de `NextId` avant que l'un ou l'autre ne l'incrémente, et donc attribuer le même ID à deux événements différents.

Autre problème : que se passe-t-il si un producteur (un callback) est en train de rajouter un événement dans la file (donc en train de modifier `Tail` et `Count`) pendant qu'un consommateur en retire un en même temps, en lisant ces mêmes champs ? Le consommateur pourrait alors lire un `Count` ou un `Tail` dans un état intermédiaire, incohérent, ce qui peut corrompre l'ordre de la file ou faire lire un événement qui n'a pas encore été complètement écrit.

Afin de résoudre ce problème, on a besoin d'exclure mutuellement les champs de la structure de notre file. En effet, lorsqu'un composant de notre driver modifie le buffer, les index `Head`/`Tail`/`Count` ou le compteur `NextId`, personne d'autre ne doit être capable de les modifier en même temps.

On va donc utiliser une **primitive de synchronisation**.

### Primitives de synchronisation : le spinlock

La primitive de synchronisation que j'ai choisie est le **spinlock**. Pour deux raisons :
1. Je n'avais jamais implémenté cette primitive.
2. Elle correspondait à une contrainte technique du projet.

Mais concrètement, qu'est-ce qu'un spinlock ?

Pour résumer, un spinlock, c'est un peu comme une cabine d'essayage : si quelqu'un est déjà à l'intérieur, la porte est verrouillée. Si une nouvelle personne arrive, elle n'a pas d'autre choix que d'attendre juste devant, en vérifiant sans arrêt si la porte s'est déverrouillée. Elle ne va pas s'asseoir ailleurs et attendre qu'on la prévienne que la cabine est libre.

C'est exactement ce que fait un spinlock : un thread qui ne peut pas l'acquérir reste actif à « vérifier » en boucle (*busy-wait*) au lieu de se mettre en sommeil, contrairement à un mutex où le thread en attente serait plutôt notifié une fois la ressource libérée. Cependant, le thread qui patiente consomme du CPU pendant toute la durée de l'attente. Un spinlock n'est donc adapté qu'à des sections critiques très courtes.

Voici un exemple d'utilisation avec les fonctions `KeAcquireSpinLock` et `KeReleaseSpinLock` :

```c
KIRQL OldIrql;

KeAcquireSpinLock(&g_EventQueue.Lock, &OldIrql);

// section critique : accès exclusif à g_EventQueue qui représente notre file

KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);
```

`KeAcquireSpinLock` élève l'IRQL courant à `DISPATCH_LEVEL` et sauvegarde l'ancien IRQL dans `OldIrql`, afin que `KeReleaseSpinLock` puisse le restaurer une fois la section critique terminée.

Maintenant, pourquoi avoir choisi un spinlock plutôt qu'un mutex pour protéger `g_EventQueue` ? La réponse est l'IRQL (*Interrupt Request Level*), qui représente le niveau de priorité d'interruption auquel le processeur exécute du code à un instant donné.

Un mutex ne peut être acquis qu'à `PASSIVE_LEVEL`, le niveau le plus bas. En effet, lorsqu'un thread ne parvient pas à acquérir un mutex, il est mis en sommeil par le scheduler en attendant que la ressource se libère. Or, cette mise en sommeil n'est possible que si le scheduler lui-même peut intervenir, ce qui n'est plus le cas dès qu'on dépasse `PASSIVE_LEVEL`.

Un spinlock n'a pas cette limitation. En effet, comme expliqué plus haut, un thread qui attend un spinlock boucle activement plutôt que de se mettre en sommeil : il peut donc être acquis à n'importe quel IRQL, jusqu'à `DISPATCH_LEVEL` inclus.

Les futurs capteurs du driver (création de processus, chargement d'image, accès registre, réseau via WFP) seront chacun implémentés via un callback ou callout noyau, et ces callbacks ne s'exécutent pas tous au même IRQL. Si `g_EventQueue` avait été protégée par un mutex, un callback exécuté à `DISPATCH_LEVEL` aurait provoqué un bugcheck en tentant de l'acquérir.

Maintenant que les bases théoriques sont posées, passons à l'implémentation !

---

## Implémentation de la file

Nous avons déjà introduit, plus haut, la structure `KDAMON_EVENT_QUEUE` que nous allons utiliser pour la file (voir [Qu'est-ce qu'une file ?](#quest-ce-quune-file-)). Passons aux méthodes qui vont nous permettre d'interagir avec cette dernière.

> Toutes les fonctions (et la structure) présentées sont dans le fichier `event_queue.c`.

### Initialisation (et destruction de la file)

Afin de créer la file, nous allons créer une fonction `KdaMonEventQueueInitialize` qui n'aura que deux responsabilités :
- mettre à zéro la structure `KDAMON_EVENT_QUEUE` via l'objet global : `static KDAMON_EVENT_QUEUE g_EventQueue;`
- initialiser le spinlock de la structure avec `KeInitializeSpinLock` : `KeInitializeSpinLock(&g_EventQueue.Lock);` 

Cette fonction retourne `TRUE`.

La fonction `KdaMonEventQueueDestroy` existe mais ne fait rien pour l'instant (elle est vide), pour une raison simple : l'entièreté de la structure est statique, il n'y a donc rien à libérer manuellement. Voici le code des fonctions :

```c
BOOLEAN KdaMonEventQueueInitialize(VOID)
{
    RtlZeroMemory(&g_EventQueue, sizeof(g_EventQueue));

    KeInitializeSpinLock(&g_EventQueue.Lock);

    return TRUE;
}

VOID KdaMonEventQueueDestroy(VOID)
{
}
```

### Ajout et retrait d'événements

Afin d'interagir avec la file, il y a 3 fonctions :
- `EventQueueNextIndex` : Calcule l'index suivant dans le buffer circulaire, en revenant à 0 une fois la fin du buffer atteinte (`KDAMON_EVENT_QUEUE_SIZE`). Utilisée aussi bien par `Push` que par `Pop` pour faire progresser `Tail` et `Head`.
- `KdaMonEventQueuePush` : Ajoute un élément à la file.
- `KdaMonEventQueuePop` : Retire un élément de la file.

Concrètement, `EventQueueNextIndex` est assez explicite :

```c
static ULONG EventQueueNextIndex(_In_ ULONG Index)
{
    Index++;

    if (Index == KDAMON_EVENT_QUEUE_SIZE)
    {
        Index = 0;
    }

    return Index;
}
```

Les codes de `KdaMonEventQueuePush` et `KdaMonEventQueuePop` sont plus compliqués. Voici celui de `KdaMonEventQueuePush` :

```c
BOOLEAN KdaMonEventQueuePush(_In_ KDAMON_EVENT* Event)
{
    KIRQL OldIrql;

    if (Event == NULL)
    {
        return FALSE;
    }

    KeAcquireSpinLock(&g_EventQueue.Lock, &OldIrql);

    if (g_EventQueue.Count == KDAMON_EVENT_QUEUE_SIZE)
    {
        g_EventQueue.DroppedEvents++;
        KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);
        return FALSE;
    }

    Event->Id = g_EventQueue.NextId++;

    g_EventQueue.Buffer[g_EventQueue.Tail] = *Event;
    g_EventQueue.Tail = EventQueueNextIndex(g_EventQueue.Tail);

    g_EventQueue.Count++;

    KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);

    return TRUE;
}
```

La fonction commence par une vérification : si `Event` est `NULL`, elle retourne immédiatement `FALSE` sans toucher au lock.

Le spinlock est ensuite acquis, et toute la logique qui suit se déroule dans la section critique qu'on a présentée plus haut (voir [Primitives de synchronisation : le spinlock](#primitives-de-synchronisation--le-spinlock)).

Il y a deux cas à gérer :
- Premier cas : la file est pleine (`Count == KDAMON_EVENT_QUEUE_SIZE`). Dans ce cas, l'événement n'est pas ajouté. On incrémente `DroppedEvents` et on retourne `FALSE`. L'appelant sait ainsi que l'événement n'a pas été pris en compte, sans jamais risquer de mettre en attente un callback noyau.
- Deuxième cas : la file n'est pas pleine, l'événement peut être ajouté. La première chose faite est l'attribution de l'`Id` : `Event->Id = g_EventQueue.NextId++`. Enfin, l'événement est copié dans le buffer à la position `Tail`, l'index `Tail` est avancé via `EventQueueNextIndex`, et `Count` est incrémenté pour refléter le nouvel état de la file. Le lock est relâché, et la fonction retourne `TRUE`.

Voici celui de `KdaMonEventQueuePop` :

```c
BOOLEAN KdaMonEventQueuePop(_Out_ KDAMON_EVENT* Event)
{
    KIRQL OldIrql;

    if (Event == NULL)
    {
        return FALSE;
    }

    KeAcquireSpinLock(&g_EventQueue.Lock, &OldIrql);

    if (g_EventQueue.Count == 0)
    {
        KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);
        return FALSE;
    }

    *Event = g_EventQueue.Buffer[g_EventQueue.Head];
    g_EventQueue.Head = EventQueueNextIndex(g_EventQueue.Head);

    g_EventQueue.Count--;

    KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);

    return TRUE;
}
```

Cette fonction est globalement un miroir de `KdaMonEventQueuePush`. Le début est strictement identique. Mais les cas à gérer sont différents :
- Premier cas : la file est vide (`Count == 0`), dans ce cas on relâche le spinlock et on retourne `FALSE`. Il n'y a rien à retirer de la file.
- Deuxième cas : la file a au moins un événement. 
    - L'événement situé à `g_EventQueue.Buffer[g_EventQueue.Head]` est copié dans `*Event`, le paramètre de sortie fourni par l'appelant. 
    - On calcule ensuite l'index suivant dans le buffer à l'aide de `EventQueueNextIndex` et on le met dans `g_EventQueue.Head`. 
    - Enfin, on décrémente le nombre total d'éléments dans la file (`g_EventQueue.Count--`).

### Taille actuelle de la file

La dernière fonction implémentée est `KdaMonEventQueueCount`. Cette fonction va nous permettre de vérifier de manière sécurisée (avec le spinlock) le nombre d'éléments actuellement dans la file :

```c
ULONG KdaMonEventQueueCount(VOID)
{
    KIRQL OldIrql;
    ULONG EventCount;

    KeAcquireSpinLock(&g_EventQueue.Lock, &OldIrql);

    EventCount = g_EventQueue.Count;

    KeReleaseSpinLock(&g_EventQueue.Lock, OldIrql);

    return EventCount;
}
```

---

## Exemple : test de la file d'événements

Pour valider que la file fonctionne comme prévu, j'ai ajouté un test directement dans `DriverEntry`, entre les balises `// --- BEGIN TEST QUEUE ---` et `// --- END TEST QUEUE ---` :

```c
#include "driver.h"
#include "device.h"
#include "ioctl.h"
#include "kdamon_config.h"
#include "event_queue.h"


PDEVICE_OBJECT g_DeviceObject = NULL;

void DriverUnload(_In_ PDRIVER_OBJECT DriverObject)
{
    UNREFERENCED_PARAMETER(DriverObject);

    KdaMonEventQueueDestroy();
    KdaMonDeleteDevice(g_DeviceObject);
    KdPrint((DRIVER_TAG " [SUCCESS]: Driver Unload called\n"));
}

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

    KdPrint((DRIVER_TAG " [TEST]: Queue count after 2 pushes = %lu\n", KdaMonEventQueueCount()));

    KDAMON_EVENT popped;
    while (KdaMonEventQueuePop(&popped)) {
        KdPrint((DRIVER_TAG " [TEST]: Popped event Id=%lu Type=%d\n", popped.Id, popped.Type));
    }

    KdPrint((DRIVER_TAG " [TEST]: Queue count after pops = %lu\n", KdaMonEventQueueCount()));
    // --- END TEST QUEUE ---

    return STATUS_SUCCESS;
}
```

Le déroulé est simple : 
1. Deux événements sont poussés dans la file (un `KdaMonEventProcess` et un `KdaMonEventNetwork`)
2. `KdaMonEventQueueCount` est appelée pour vérifier que la file en contient bien 2. 
3. Une boucle retire tous les événements un par un jusqu'à ce que `KdaMonEventQueuePop` retourne `FALSE` (file vide), en affichant à chaque fois l'`Id` et le `Type` de l'événement récupéré. 

On s'attend à récupérer d'abord l'événement `Process` (`Id = 0`), puis l'événement `Network` (`Id = 1`) — dans l'ordre exact où ils ont été ajoutés, confirmant le comportement FIFO de la file. Enfin, `KdaMonEventQueueCount` est appelée une dernière fois pour vérifier que la file est bien revenue à 0.

Voici une démonstration de ce test en exécution :

<video controls width="100%">
  <source src="demo-queue.mp4" type="video/mp4">
</video>

---

## Conclusion

KDAMonitor dispose maintenant d'une structure d'événement générique (`KDAMON_EVENT`) et d'une file circulaire capable de la stocker, protégée par un spinlock compatible avec n'importe quel IRQL jusqu'à `DISPATCH_LEVEL`.

Le compteur `DroppedEvents`, qui suit le nombre d'événements rejetés faute de place dans la file, est bien incrémenté mais n'est encore ni exposé ni consulté nulle part.

La prochaine version (v0.4) viendra donner une utilité concrète à cette file : un thread dédié viendra la vider automatiquement vers un fichier de log. Une fois cette étape posée, les versions suivantes (v0.5 et au-delà) pourront enfin commencer à remplir la file avec les callbacks/callouts noyau (création de processus, chargement d'image, registre, réseau et thread).


Merci d'avoir lu jusqu'au bout et à bientôt pour le prochain et quatrième article de cette série : **Écriture des événements sur disque : journalisation JSONL, événements de réveil et premier crash**.