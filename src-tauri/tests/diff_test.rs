use micro_studio_agent_lib::diff::{
    compute_diff, delete_all_diffs, delete_diffs_for_file, get_all_diffs, get_diffs_for_file,
    save_diff,
};
use std::path::PathBuf;
use tempfile::TempDir;

fn missing_database_path(temp_dir: &TempDir) -> PathBuf {
    temp_dir.path().join("diffs.db")
}

#[test]
fn database_read_and_delete_operations_initialize_schema() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = missing_database_path(&temp_dir);

    assert!(get_all_diffs(&db_path).unwrap().is_empty());
    assert!(get_diffs_for_file(&db_path, "src/main.ms")
        .unwrap()
        .is_empty());
    assert_eq!(delete_diffs_for_file(&db_path, "src/main.ms").unwrap(), 0);
    assert_eq!(delete_all_diffs(&db_path).unwrap(), 0);
}

#[test]
fn save_diff_initializes_schema_and_supports_retrieval_and_deletion() {
    let temp_dir = TempDir::new().expect("failed to create temp dir");
    let db_path = missing_database_path(&temp_dir);
    let first_file = "src/main.ms";
    let second_file = "src/other.ms";

    let first_id = save_diff(&db_path, first_file, "first diff").expect("save first diff");
    let second_id = save_diff(&db_path, second_file, "second diff").expect("save second diff");
    assert!(second_id > first_id);

    assert_eq!(
        get_diffs_for_file(&db_path, first_file).unwrap(),
        vec!["first diff"]
    );
    assert_eq!(
        get_all_diffs(&db_path).unwrap(),
        vec![
            (first_file.to_string(), "first diff".to_string()),
            (second_file.to_string(), "second diff".to_string())
        ]
    );

    assert_eq!(delete_diffs_for_file(&db_path, first_file).unwrap(), 1);
    assert!(get_diffs_for_file(&db_path, first_file).unwrap().is_empty());
    assert_eq!(delete_all_diffs(&db_path).unwrap(), 1);
    assert!(get_all_diffs(&db_path).unwrap().is_empty());
}

#[test]
fn unchanged_files_do_not_produce_a_diff() {
    let content = "unchanged";
    assert_eq!(compute_diff(content, content), None);
}
