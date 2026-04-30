import argparse
import os
import sys

from google.cloud import firestore

CONFIRM_ENV = "ELITEBUILD_ALLOW_DANGEROUS_CLEANUP"
CONFIRM_VALUE = "I_UNDERSTAND_THIS_DELETES_DATA"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dangerous manual cleanup utility for leads plus inventory normalization. Defaults to dry-run."
    )
    parser.add_argument(
        "--project-id",
        required=True,
        help="GCP project ID to operate on. Required so the target is never implied.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete leads and update inventory documents. Omit for dry-run.",
    )
    return parser.parse_args()


def require_execute_confirmation(project_id: str) -> bool:
    if os.environ.get(CONFIRM_ENV) != CONFIRM_VALUE:
        print(
            "Refusing destructive cleanup. Set "
            f"{CONFIRM_ENV}={CONFIRM_VALUE!r} only when you are ready to delete data."
        )
        return False

    expected = f"DELETE LEADS AND NORMALIZE INVENTORY IN {project_id}"
    try:
        typed = input(f"Type {expected!r} to continue: ")
    except EOFError:
        print("Refusing destructive cleanup because confirmation input was not available.")
        return False

    if typed != expected:
        print("Refusing destructive cleanup because the confirmation text did not match exactly.")
        return False

    return True


def cleanup_database(db: firestore.Client, execute: bool) -> None:
    print("Starting Elite Build CRM cleanup check...")

    leads_ref = db.collection("leads")
    leads = list(leads_ref.get())
    if not execute:
        print(f"DRY RUN: would delete {len(leads)} lead documents.")
    else:
        print(f"Deleting {len(leads)} lead documents...")
        for lead in leads:
            lead.reference.delete()
        print("Leads collection cleared.")

    inventory_ref = db.collection("inventory")
    plots = list(inventory_ref.get())
    if not execute:
        print(f"DRY RUN: would normalize {len(plots)} inventory documents.")
        print("Rerun with --execute plus the required confirmation guard to apply.")
        return

    print(f"Normalizing {len(plots)} inventory documents...")
    for plot in plots:
        data = plot.to_dict()
        updates = {
            "status": data.get("status", "Available"),
            "location": data.get("location") or "Huyilalu",
            "price": float(data.get("price", 0)),
            "facing": data.get("facing") or "North",
        }
        plot.reference.update(updates)
        print(f"  Fixed Plot: {plot.id}")

    print("Database cleanup completed.")


def main() -> int:
    args = parse_args()
    if args.execute and not require_execute_confirmation(args.project_id):
        return 2

    db = firestore.Client(project=args.project_id)
    cleanup_database(db, args.execute)
    return 0


if __name__ == "__main__":
    sys.exit(main())
