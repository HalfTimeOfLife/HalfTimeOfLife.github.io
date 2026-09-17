---
title: "06 - Deuxième capteur : suivi du chargement des images et des DLL"
date: 2026-09-17
draft: false
description: "Implémentation du deuxième capteur de KDAMonitor : surveillance du chargement des images."
summary: "Implémentation du deuxième capteur de KDAMonitor : surveillance du chargement des images."
series: ["KDAMonitor"]
series_order: 6
tags:
  - KDAMonitor
  - Windows Kernel
  - Kernel Driver
  - C
---

Bienvenue dans le sixième article de la série sur le développement de KDAMonitor !

Dans cet article, je vais couvrir la version v0.6 de ce projet. Dans cette version, j'implémente le deuxième capteur du projet : le capteur de chargement d'image.

Voici les fichiers concernés par cet article, et la section qui les explique :

| Fichier | Rôle | Section |
| --- | --- | --- |
| `event_types.h` | Nouveau type `KDAMON_IMAGE_LOAD_EVENT_DATA` + union dans `KDAMON_EVENT` | [Que récupérer lors du chargement d'une image ?](#que-récupérer-lors-du-chargement-dune-image-) |
| `image_callback.h` | Déclaration du register/unregister | [Implémenter le callback](#implémenter-le-callback) |
| `image_callback.c` | Le callback lui-même | [Implémenter le callback](#implémenter-le-callback) |
| `log_writer.c` | Sérialisation JSONL spécifique aux événements de chargement d'image | [Sérialiser les événements de chargement d'image en JSONL](#sérialiser-les-événements-de-chargement-dimage-en-jsonl) |
| `driver_entry.c` | Enregistrement/désenregistrement du callback au chargement/déchargement | [Intégration dans `driver_entry.c`](#intégration-dans-driver_entryc) |

> Le projet peut être retrouvé dans ce dépôt : [KDAMonitor](https://github.com/HalfTimeOfLife/KDAMonitor).

---

## Que récupérer lors du chargement d'une image ?

Lorsqu'une image est chargée, le callback va pouvoir récupérer un certain nombre d'informations. J'ai choisi de retenir les informations suivantes qui me semblent être les plus indicatives :

- l'ID du processus dans lequel l'image est mappée (`ProcessId`)
- l'adresse et la taille du mapping (`ImageBase`, `ImageSize`)
- les propriétés brutes de l'image (`Properties`)
- trois indicateurs extraits de ces propriétés : `SystemModeImage`, `ImageMappedToAllPids`, `ImagePartialMap`
- le niveau et le type de signature de l'image (`SignatureLevel`, `SignatureType`)
- le chemin complet de l'image (`ImageFileName`)

On a donc la structure suivante dans `event_types.h` :

```c
typedef struct _KDAMON_IMAGE_LOAD_EVENT_DATA
{
    HANDLE ProcessId;

    PVOID ImageBase;
    SIZE_T ImageSize;

    ULONG Properties;

    ULONG SystemModeImage;
    ULONG ImageMappedToAllPids;
    ULONG ImagePartialMap;

    ULONG SignatureLevel;
    ULONG SignatureType;

    WCHAR ImageFileName[260];
} KDAMON_IMAGE_LOAD_EVENT_DATA;
```

> Le magic number `260` correspond à la longueur maximale des chemins dans Windows et sera changé en une macro dans une version ultérieure :)

---

## Implémenter le callback

Cette partie va expliquer l'implémentation dans le driver des callbacks, tout est dans le fichier `image_callback.c`. Tout comme le capteur de processus, il y a trois fonctions, dont deux sont exposées dans le header. Ces deux fonctions sont strictement identiques à celles décrites dans l'article précédent, à l'exception des noms :

- `NTSTATUS KdaMonImageCallbackRegister(VOID);` : la fonction utilisée dans `driver_entry.c` pour enregistrer le callback

- `VOID KdaMonImageCallbackUnregister(VOID);` : la fonction utilisée dans `driver_entry.c` pour désenregistrer le callback

Et la fonction privée appelée lors du chargement d'une image :

```c
static VOID KdaMonImageNotifyRoutine(
	_In_opt_ PUNICODE_STRING FullImageName, 
	_In_ HANDLE ProcessId, 
	_In_ PIMAGE_INFO ImageInfo
);
```

La signature de cette fonction suit la forme suivante :

```c
PLOAD_IMAGE_NOTIFY_ROUTINE LoadImageNotifyRoutine;

VOID LoadImageNotifyRoutine(
  [in, optional] PUNICODE_STRING FullImageName,
  [in]           HANDLE ProcessId,
  [in]           PIMAGE_INFO ImageInfo
)
{...}
```

> Voir la documentation Microsoft pour [PLOAD_IMAGE_NOTIFY_ROUTINE](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddk/nc-ntddk-pload_image_notify_routine), la routine utilisée par [PsSetLoadImageNotifyRoutine](https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntddk/nf-ntddk-pssetloadimagenotifyroutine). 

### La routine de notification

Commençons par définir la routine appelée lors du chargement d'une image. Comme montré ci-dessus, la signature de cette routine nous donne trois informations :

- `PUNICODE_STRING FullImageName` : Un pointeur vers la chaîne de caractères (Unicode) contenant le nom de l'image
- `HANDLE ProcessId` : L'ID du processus dans lequel l'image est mappée
- `PIMAGE_INFO ImageInfo` : Un pointeur vers la structure `IMAGE_INFO` qui donne des informations sur l'image

> Voici la documentation de `IMAGE_INFO` : [IMAGE_INFO structure (filter.h)](https://learn.microsoft.com/en-us/windows/win32/api/filter/ns-filter-image_info).

On commence par créer l'événement :

```c
KDAMON_EVENT Event = { 0 };
Event.Type = KdaMonEventImageLoad;
KeQuerySystemTimePrecise(&Event.Timestamp);

// ProcessId est déjà donné dans la signature de la fonction !
Event.Data.ImageLoad.ProcessId = ProcessId;
```

Contrairement à `FullImageName`, `ImageInfo` n'est pas documenté comme optionnel (annoté `_In_` et non `_In_opt_`). On garde tout de même une vérification par précaution avant de l'utiliser :

```c
if (ImageInfo) {
	Event.Data.ImageLoad.ImageBase = ImageInfo->ImageBase;
	Event.Data.ImageLoad.ImageSize = ImageInfo->ImageSize;
	Event.Data.ImageLoad.Properties = ImageInfo->Properties;
	Event.Data.ImageLoad.SystemModeImage = ImageInfo->SystemModeImage;
	Event.Data.ImageLoad.ImageMappedToAllPids = ImageInfo->ImageMappedToAllPids;
	Event.Data.ImageLoad.ImagePartialMap = ImageInfo->ImagePartialMap;
	Event.Data.ImageLoad.SignatureLevel = ImageInfo->ImageSignatureLevel;
	Event.Data.ImageLoad.SignatureType = ImageInfo->ImageSignatureType;
}
```

`FullImageName`, lui, est explicitement documenté comme optionnel : il faut donc le tester avant de l'utiliser, au cas où il vaudrait `NULL` ou pointerait vers un buffer vide. La copie reprend le même principe de troncature sécurisée que pour `ImageFileName` dans l'article 05. Et enfin, on ajoute l'événement à la file :

```c
if (FullImageName && FullImageName->Buffer != NULL) {
	SIZE_T MaxCopyLength = sizeof(Event.Data.ImageLoad.ImageFileName) - sizeof(WCHAR);
	SIZE_T ImageFileNameLength = (FullImageName->Length < MaxCopyLength) ? FullImageName->Length : MaxCopyLength;
	RtlCopyMemory(Event.Data.ImageLoad.ImageFileName, FullImageName->Buffer, ImageFileNameLength);
	Event.Data.ImageLoad.ImageFileName[ImageFileNameLength / sizeof(WCHAR)] = L'\0';
}
else {
	Event.Data.ImageLoad.ImageFileName[0] = L'\0';
}

KdaMonEventQueuePush(&Event);
```

Ci-dessous, le code complet de `KdaMonImageNotifyRoutine` :

```c
static VOID KdaMonImageNotifyRoutine(
	_In_opt_ PUNICODE_STRING FullImageName, 
	_In_ HANDLE ProcessId, 
	_In_ PIMAGE_INFO ImageInfo
)
{
	KDAMON_EVENT Event = { 0 };
	Event.Type = KdaMonEventImageLoad;
	KeQuerySystemTimePrecise(&Event.Timestamp);

	Event.Data.ImageLoad.ProcessId = ProcessId;

	if (ImageInfo) {
		Event.Data.ImageLoad.ImageBase = ImageInfo->ImageBase;
		Event.Data.ImageLoad.ImageSize = ImageInfo->ImageSize;
		Event.Data.ImageLoad.Properties = ImageInfo->Properties;
		Event.Data.ImageLoad.SystemModeImage = ImageInfo->SystemModeImage;
		Event.Data.ImageLoad.ImageMappedToAllPids = ImageInfo->ImageMappedToAllPids;
		Event.Data.ImageLoad.ImagePartialMap = ImageInfo->ImagePartialMap;
		Event.Data.ImageLoad.SignatureLevel = ImageInfo->ImageSignatureLevel;
		Event.Data.ImageLoad.SignatureType = ImageInfo->ImageSignatureType;
	}

	if (FullImageName && FullImageName->Buffer != NULL) {
		SIZE_T MaxCopyLength = sizeof(Event.Data.ImageLoad.ImageFileName) - sizeof(WCHAR);
		SIZE_T ImageFileNameLength = (FullImageName->Length < MaxCopyLength) ? FullImageName->Length : MaxCopyLength;
		RtlCopyMemory(Event.Data.ImageLoad.ImageFileName, FullImageName->Buffer, ImageFileNameLength);
		Event.Data.ImageLoad.ImageFileName[ImageFileNameLength / sizeof(WCHAR)] = L'\0';
	}
	else {
		Event.Data.ImageLoad.ImageFileName[0] = L'\0';
	}

	KdaMonEventQueuePush(&Event);
}
```

### Enregistrer et désenregistrer le callback

Pour ce callback, on utilise `PsSetLoadImageNotifyRoutine` pour l'enregistrer et `PsRemoveLoadImageNotifyRoutine` pour le désenregistrer :

```c
NTSTATUS KdaMonImageCallbackRegister(VOID)
{
	NTSTATUS status = PsSetLoadImageNotifyRoutine(KdaMonImageNotifyRoutine);
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG "[ERROR] PsSetLoadImageNotifyRoutine failed: 0x%08X\n", status));
	}
	return status;
}

VOID KdaMonImageCallbackUnregister(VOID)
{
	NTSTATUS status = PsRemoveLoadImageNotifyRoutine(KdaMonImageNotifyRoutine);
	if (!NT_SUCCESS(status))
	{
		KdPrint((DRIVER_TAG "[ERROR] PsRemoveLoadImageNotifyRoutine failed: 0x%08X\n", status));
	}
}
```

---

## Sérialiser les événements de chargement d'image en JSONL

Voici la fonction dédiée à la sérialisation des événements de chargement d'image :

```c
static NTSTATUS KdaMonLogWriterWriteImageEvent(_In_ const KDAMON_EVENT* Event, _Out_writes_z_(BufferSize) PSTR EventBuffer, _In_ SIZE_T BufferSize)
{
    CHAR EscapedImage[520];
    if (!KdaMonJsonEscapeW(Event->Data.ImageLoad.ImageFileName, EscapedImage, sizeof(EscapedImage)))
    {
        KdPrint((DRIVER_TAG " [WARNING]: Image path truncated during JSON escape (event %lu)\n", Event->Id));
	}
	return RtlStringCbPrintfA(
		EventBuffer,
		BufferSize,
		"{\"id\":%lu,\"type\":\"%s\",\"timestamp\":%lld,"
		"\"pid\":%lu,\"image_base\":\"%p\",\"image_size\":%llu,"
		"\"system_mode_image\":%s,\"image_mapped_to_all_pids\":%s,"
		"\"image_partial_map\":%s,\"signature_level\":%u,\"signature_type\":%u,"
		"\"image\":\"%s\"}\n",
		Event->Id,
		KdaMonEventTypeToString(Event->Type),
		Event->Timestamp.QuadPart,
		(ULONG)(ULONG_PTR)Event->Data.ImageLoad.ProcessId,
		Event->Data.ImageLoad.ImageBase,
		(unsigned long long)Event->Data.ImageLoad.ImageSize,
		Event->Data.ImageLoad.SystemModeImage ? "true" : "false",
		Event->Data.ImageLoad.ImageMappedToAllPids ? "true" : "false",
		Event->Data.ImageLoad.ImagePartialMap ? "true" : "false",
		Event->Data.ImageLoad.SignatureLevel,
		Event->Data.ImageLoad.SignatureType,
		EscapedImage
	);
}
```

Voici, brièvement, le déroulement de la fonction :

1. On échappe les caractères spéciaux du chemin de l'image avec la fonction `KdaMonJsonEscapeW`.

> Cette fonction ne sera pas détaillée ici pour des raisons de simplicité. Néanmoins, elle peut être consultée dans le code du fichier [log_writer.c](https://github.com/HalfTimeOfLife/KDAMonitor/blob/main/driver/src/log_writer.c).

2. On remplit le buffer `EventBuffer` avec les informations récupérées par l'événement, au format JSON.

La ligne d'événement d'un chargement d'image aura la forme suivante :

```json
{"id":137,"type":"image_load","timestamp":134025123456789012,"pid":1234,"image_base":"0x00007FFA12340000","image_size":45056,"system_mode_image":false,"image_mapped_to_all_pids":false,"image_partial_map":false,"signature_level":8,"signature_type":1,"image":"C:\\PATH\\TO\\DLL.dll"}
```

---

## Intégration dans `driver_entry.c`

On commence par rajouter le désenregistrement dans `DriverUnload` :

```c
void DriverUnload(_In_ PDRIVER_OBJECT DriverObject)
{
	UNREFERENCED_PARAMETER(DriverObject);

	KdaMonImageCallbackUnregister(); // Désenregistrement du callback
	KdaMonProcessCallbackUnregister();
	KdaMonLogWriterStop();
	KdaMonEventQueueDestroy();
	KdaMonDeleteDevice(g_DeviceObject);
	KdPrint((DRIVER_TAG " [SUCCESS]: Driver Unload called\n"));
}
```

Pour l'instant, le callback de chargement d'image est le dernier à avoir été enregistré, il est donc le premier à être désenregistré.

Dans `DriverEntry`, on rajoute l'enregistrement à la fin de la fonction juste après l'enregistrement du callback des processus :

```c
NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject, _In_ PUNICODE_STRING RegistryPath)
{
	UNREFERENCED_PARAMETER(RegistryPath);

	...
	// --- Register process creation callback ---
	if (!NT_SUCCESS(KdaMonProcessCallbackRegister()))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonProcessCallbackRegister failed\n"));
		return STATUS_UNSUCCESSFUL;
	}

	// --- Register image load callback ---
	if (!NT_SUCCESS(KdaMonImageCallbackRegister()))
	{
		KdPrint((DRIVER_TAG " [ERROR]: KdaMonImageCallbackRegister failed\n"));
		return STATUS_UNSUCCESSFUL;
	}

	KdPrint((DRIVER_TAG " [SUCCESS]: Initialized successfully\n"));
	return STATUS_SUCCESS;
}
```

Pour cette version, le test de validation va être de vérifier que le capteur capture bien les chargements d'images d'un processus courant (ses DLL de dépendance), ainsi qu'un chargement de DLL isolé et facilement identifiable. Pour cela, j'ai réalisé le script suivant (`test_v06.ps1`) :

```powershell
# test_v06.ps1

$Driver = "KDAMonitor"
$DriverPath = "$env:USERPROFILE\Desktop\$Driver.sys"

sc.exe stop $Driver
sc.exe delete $Driver

sc.exe create $Driver type= kernel binPath= $DriverPath
sc.exe start $Driver

Start-Process notepad.exe -Wait

rundll32.exe user32.dll,MessageBeep

sc.exe stop $Driver
sc.exe delete $Driver
```

Voici une démonstration de ce test en exécution :

<video controls width="100%">
  <source src="demo-image-sensor.mp4" type="video/mp4">
</video>

---

## Conclusion

Un deuxième capteur de fait ! Rien de très nouveau dans cet article qui ressemble beaucoup au précédent, le prochain sera cependant différent :).

![KDAMonitor architecture](kdamonitor_architecture.svg)

Merci d'avoir lu jusqu'au bout et à bientôt pour le prochain et septième article de cette série : **Préparation du monitoring réseau : mise en place de la session WFP**.