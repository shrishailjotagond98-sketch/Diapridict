# Diabetes Prediction Backend

This API reproduces the notebook's workflow:

1. Read `diabetes_dataset.csv`
2. Separate `Outcome` from the 8 features
3. Fit `StandardScaler`
4. Split with `test_size=0.2`, `stratify=y`, `random_state=2`
5. Train `svm.SVC(kernel="linear")`
6. Predict through `POST /predict`

## Setup

Create a virtual environment (optional but recommended):

### Windows

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Then put your exact `diabetes_dataset.csv` in this `backend` folder.

Start the API:

```bash
uvicorn main:app --reload --port 8000
```

The API will be available at:

`http://localhost:8000`

Swagger API docs:

`http://localhost:8000/docs`
