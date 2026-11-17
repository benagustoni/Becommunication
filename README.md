# PF Nettoyage - Facility Services

Site officiel : https://www.pfnettoyage.ch/

Le formulaire transmet les demandes en JSON à `POST /api/devis`, sans ouvrir une application de messagerie. Le serveur produit le récapitulatif PDF et l'attache au message adressé à PF Nettoyage puis à l'accusé envoyé au demandeur, si une adresse e-mail est renseignée.

## Installation et tests

Node.js 24 ou supérieur, puis `npm ci` et `npm test`.

Le site statique se trouve dans `public/`, le serveur dans `api/` et le générateur PDF dans `lib/`.

## Configuration Vercel

Projet : `becommunication/pf-nettoyage-facility-services`. Racine du dépôt, sortie `public`, installation `npm ci`. Déployer dans l'environnement **Production** avant d'affecter `www.pfnettoyage.ch` : les réglages SMTP existants sont limités à Production. Une prévisualisation sans ces réglages renvoie `503 sending_unavailable`.

Renseigner les variables indiquées dans `.env.example` directement dans les réglages Vercel. `SMTP_PASSWORD` doit rester de type Secret et ne doit jamais être commis. Avec Gmail, utiliser un mot de passe d'application du compte principal renseigné dans `SMTP_USER`, lorsque la politique Google le permet. L'adresse `devis@pfnettoyage.ch` doit être une boîte ou un alias d'expédition autorisé pour ce compte. Ne pas remplacer le compte d'authentification par un alias.

Port 465 : TLS implicite. Port 587 : STARTTLS obligatoire. La validation TLS reste active. `QUOTE_FROM_EMAIL` = `PF Nettoyage <devis@pfnettoyage.ch>`, `QUOTE_TO_EMAIL` = `pfnettoyage@gmail.com`, `QUOTE_CC_EMAIL` vide.

## Vérification de l'envoi

Envoyer une demande portant clairement la mention TEST, vers une adresse contrôlée. Vérifier le retour de l'API, les journaux Vercel et la réception des deux messages avec leur PDF. `ok: true` signifie que le serveur SMTP a accepté la demande ; cela ne prouve pas son arrivée dans la boîte de réception. Si `confirmation` vaut `failed`, la demande principale a été acceptée et ne doit pas être renvoyée.

Les journaux indiquent uniquement la référence et les codes techniques. `535 / EAUTH` signale un refus à l'authentification SMTP ; aucun message ou secret SMTP n'est journalisé. La protection contre les soumissions répétées est locale à chaque instance, pendant une minute.
