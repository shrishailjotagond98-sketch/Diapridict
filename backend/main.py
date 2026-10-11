from pathlib import Path

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sklearn import svm
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix

BASE_DIR = Path(__file__).resolve().parent
DATASET = BASE_DIR / "diabetes_dataset.csv"

FEATURES = [
    "Pregnancies", "Glucose", "BloodPressure", "SkinThickness",
    "Insulin", "BMI", "DiabetesPedigreeFunction", "Age"
]

DISPLAY = {
    "Pregnancies": "Pregnancies",
    "Glucose": "Glucose",
    "BloodPressure": "Blood Pressure",
    "SkinThickness": "Skin Thickness",
    "Insulin": "Insulin",
    "BMI": "BMI",
    "DiabetesPedigreeFunction": "Diabetes Pedigree",
    "Age": "Age",
}

app = FastAPI(title="Diabetes Prediction Analytics API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scaler = StandardScaler()
classifier = svm.SVC(kernel="linear")
model_accuracy = None
analytics = {}


class PredictionInput(BaseModel):
    pregnancies: float = Field(ge=0)
    glucose: float = Field(ge=0)
    blood_pressure: float = Field(ge=0)
    skin_thickness: float = Field(ge=0)
    insulin: float = Field(ge=0)
    bmi: float = Field(ge=0)
    diabetes_pedigree: float = Field(ge=0)
    age: float = Field(ge=0)


def load_and_train():
    global model_accuracy, analytics
    if not DATASET.exists():
        raise FileNotFoundError(
            f"Dataset not found: {DATASET}. Put diabetes_dataset.csv inside the backend folder."
        )

    dataset = pd.read_csv(DATASET)
    aliases = {
        "Pregnancies": ["Pregnancies"],
        "Glucose": ["Glucose"],
        "BloodPressure": ["BloodPressure", "Blood Pressure"],
        "SkinThickness": ["SkinThickness", "Skin Thickness"],
        "Insulin": ["Insulin"],
        "BMI": ["BMI"],
        "DiabetesPedigreeFunction": ["DiabetesPedigreeFunction", "Diabetes Pedigree Function"],
        "Age": ["Age"],
    }
    rename = {}
    for canonical, names in aliases.items():
        found = next((name for name in names if name in dataset.columns), None)
        if not found:
            raise ValueError(f"Missing required dataset column for {canonical}. Found: {list(dataset.columns)}")
        rename[found] = canonical
    dataset = dataset.rename(columns=rename)
    if "Outcome" not in dataset.columns:
        raise ValueError("Dataset must contain an 'Outcome' column.")

    X = dataset[FEATURES]
    y = dataset["Outcome"]
    X_scaled = scaler.fit_transform(X)
    X_train, X_test, y_train, y_test = train_test_split(
        X_scaled, y, test_size=0.2, stratify=y, random_state=2
    )
    classifier.fit(X_train, y_train)
    predictions = classifier.predict(X_test)
    model_accuracy = float(accuracy_score(y_test, predictions))
    cm = confusion_matrix(y_test, predictions, labels=[0, 1])

    analytics = {
        "dataset": {
            "rows": int(len(dataset)),
            "features": len(FEATURES),
            "diabetic": int((y == 1).sum()),
            "non_diabetic": int((y == 0).sum()),
        },
        "metrics": {
            "accuracy": model_accuracy,
            "precision": float(precision_score(y_test, predictions, zero_division=0)),
            "recall": float(recall_score(y_test, predictions, zero_division=0)),
            "f1": float(f1_score(y_test, predictions, zero_division=0)),
        },
        "confusion_matrix": {
            "tn": int(cm[0, 0]), "fp": int(cm[0, 1]),
            "fn": int(cm[1, 0]), "tp": int(cm[1, 1]),
        },
        "averages": {f: float(X[f].mean()) for f in FEATURES},
        "medians": {f: float(X[f].median()) for f in FEATURES},
        "coefficients": {f: float(c) for f, c in zip(FEATURES, classifier.coef_[0])},
        "feature_ranges": {
            f: {"min": float(X[f].min()), "max": float(X[f].max())} for f in FEATURES
        },
        "outcome_distribution": [
            {"name": "Not diabetic", "value": int((y == 0).sum())},
            {"name": "Diabetic", "value": int((y == 1).sum())},
        ],
    }
    return model_accuracy


@app.on_event("startup")
def startup_event():
    load_and_train()


@app.get("/")
def root():
    return {"message": "Diabetes Prediction API is running", "model": "Linear SVM", "accuracy": model_accuracy}


@app.get("/health")
def health():
    return {"status": "ok", "accuracy": model_accuracy}


@app.get("/analytics")
def get_analytics():
    return {"model": "Linear SVM", **analytics}


@app.post("/predict")
def predict(data: PredictionInput):
    try:
        values = [data.pregnancies, data.glucose, data.blood_pressure, data.skin_thickness,
                  data.insulin, data.bmi, data.diabetes_pedigree, data.age]
        input_data = pd.DataFrame([values], columns=FEATURES)
        standardized = scaler.transform(input_data)
        prediction = int(classifier.predict(standardized)[0])
        return {
            "prediction": prediction,
            "message": "The person is predicted to be diabetic." if prediction else "The person is predicted to be not diabetic.",
            "model": "Linear SVM",
            "accuracy": model_accuracy,
            "features": {DISPLAY[f]: float(v) for f, v in zip(FEATURES, values)},
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
