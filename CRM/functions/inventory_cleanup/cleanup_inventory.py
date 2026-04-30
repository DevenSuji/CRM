import argparse
import os
import sys

from google.cloud import firestore

CONFIRM_ENV = "ELITEBUILD_ALLOW_DANGEROUS_CLEANUP"
CONFIRM_VALUE = "I_UNDERSTAND_THIS_DELETES_DATA"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dangerous manual cleanup utility for inventory documents. Defaults to dry-run."
    )
    parser.add_argument(
        "--project-id",
        required=True,
        help="GCP project ID to operate on. Required so the target is never implied.",
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="Actually delete inventory documents. Omit for dry-run.",
    )
    return parser.parse_args()


def require_execute_confirmation(project_id: str) -> bool:
    if os.environ.get(CONFIRM_ENV) != CONFIRM_VALUE:
        print(
            "Refusing destructive cleanup. Set "
            f"{CONFIRM_ENV}={CONFIRM_VALUE!r} only when you are ready to delete data."
        )
        return False

    expected = f"DELETE INVENTORY FROM {project_id}"
    try:
        typed = input(f"Type {expected!r} to continue: ")
    except EOFError:
        print("Refusing destructive cleanup because confirmation input was not available.")
        return False

    if typed != expected:
        print("Refusing destructive cleanup because the confirmation text did not match exactly.")
        return False

    return True


def wipe_inventory(db: firestore.Client, execute: bool) -> None:
    plots = list(db.collection("inventory").get())
    if not plots:
        print("Inventory is already empty.")
        return

    if not execute:
        print(f"DRY RUN: would delete {len(plots)} inventory documents.")
        print("Rerun with --execute plus the required confirmation guard to apply.")
        return

    print(f"Deleting {len(plots)} inventory documents...")
    for plot in plots:
        plot.reference.delete()
    print("Inventory wiped clean.")


def main() -> int:
    args = parse_args()
    if args.execute and not require_execute_confirmation(args.project_id):
        return 2

    db = firestore.Client(project=args.project_id)
    wipe_inventory(db, args.execute)
    return 0


if __name__ == "__main__":
    sys.exit(main())
