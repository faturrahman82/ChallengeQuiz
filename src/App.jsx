import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CheckCircle2,
  Clock3,
  LogOut,
  Play,
  RefreshCcw,
  UserRound,
  XCircle,
} from "lucide-react";

const TOTAL_QUESTIONS = 10;
const QUIZ_API_URL =
  "https://opentdb.com/api.php?amount=10&category=27&difficulty=easy&encode=base64";
const QUIZ_SECONDS = 300;
const USER_KEY = "opentdb_quiz_user";
const QUIZ_KEY = "opentdb_quiz_state_animals_base64_v1";

const initialQuizState = {
  status: "idle",
  questions: [],
  currentIndex: 0,
  answers: [],
  startedAt: null,
  deadline: null,
  finishedAt: null,
};

function decodeText(value) {
  try {
    const decoded = atob(value);
    const parser = new DOMParser();
    return parser.parseFromString(decoded, "text/html").documentElement.textContent;
  } catch {
    return value;
  }
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeQuestions(results) {
  return results.map((item, index) => {
    const correctAnswer = decodeText(item.correct_answer);
    const incorrectAnswers = item.incorrect_answers.map((answer) => decodeText(answer));
    const allAnswers = [correctAnswer, ...incorrectAnswers];

    return {
      id: `${index}-${item.question}`,
      category: decodeText(item.category),
      difficulty: decodeText(item.difficulty),
      type: decodeText(item.type),
      question: decodeText(item.question),
      correctAnswer,
      options: shuffle(allAnswers),
    };
  });
}

function loadJson(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const remainingSeconds = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function getResult(quiz) {
  const answered = quiz.answers.length;
  const correct = quiz.answers.filter((answer) => answer.isCorrect).length;
  const wrong = answered - correct;

  return {
    answered,
    correct,
    wrong,
    total: quiz.questions.length,
  };
}

export default function App() {
  const [user, setUser] = useState(() => loadJson(USER_KEY, null));
  const [quiz, setQuiz] = useState(() => loadJson(QUIZ_KEY, initialQuizState));
  const [timeLeft, setTimeLeft] = useState(() => {
    const savedQuiz = loadJson(QUIZ_KEY, initialQuizState);
    return savedQuiz.deadline
      ? Math.max(0, Math.ceil((savedQuiz.deadline - Date.now()) / 1000))
      : QUIZ_SECONDS;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const currentQuestion = quiz.questions[quiz.currentIndex];
  const result = useMemo(() => getResult(quiz), [quiz]);
  const isQuizActive = quiz.status === "active";
  const isFinished = quiz.status === "finished";

  useEffect(() => {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem(QUIZ_KEY, JSON.stringify(quiz));
  }, [quiz]);

  useEffect(() => {
    if (!isQuizActive || !quiz.deadline) return undefined;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.ceil((quiz.deadline - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining <= 0) {
        setQuiz((prevQuiz) => ({
          ...prevQuiz,
          status: "finished",
          finishedAt: Date.now(),
        }));
      }
    };

    updateTimer();
    const timerId = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timerId);
  }, [isQuizActive, quiz.deadline]);

  function handleLogin(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get("name")?.toString().trim();
    const email = formData.get("email")?.toString().trim();

    if (!name || !email) {
      setError("Nama dan email wajib diisi.");
      return;
    }

    setError("");
    setUser({ name, email });
  }

  async function startQuiz() {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch(QUIZ_API_URL);
      const data = await response.json();

      if (data.response_code !== 0 || !Array.isArray(data.results) || data.results.length === 0) {
        throw new Error("Soal dari API belum tersedia. Coba mulai ulang kuis.");
      }

      const startedAt = Date.now();
      const normalizedQuestions = normalizeQuestions(data.results);

      setQuiz({
        status: "active",
        questions: normalizedQuestions,
        currentIndex: 0,
        answers: [],
        startedAt,
        deadline: startedAt + QUIZ_SECONDS * 1000,
        finishedAt: null,
      });
      setTimeLeft(QUIZ_SECONDS);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Gagal mengambil soal dari API. Periksa koneksi lalu coba lagi.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function answerQuestion(selectedAnswer) {
    if (!currentQuestion || !isQuizActive) return;

    const answer = {
      questionId: currentQuestion.id,
      question: currentQuestion.question,
      selectedAnswer,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect: selectedAnswer === currentQuestion.correctAnswer,
    };

    setQuiz((prevQuiz) => {
      const nextAnswers = [...prevQuiz.answers, answer];
      const nextIndex = prevQuiz.currentIndex + 1;
      const hasFinished = nextIndex >= prevQuiz.questions.length;

      return {
        ...prevQuiz,
        answers: nextAnswers,
        currentIndex: hasFinished ? prevQuiz.currentIndex : nextIndex,
        status: hasFinished ? "finished" : "active",
        finishedAt: hasFinished ? Date.now() : null,
      };
    });
  }

  function resetQuiz() {
    localStorage.removeItem(QUIZ_KEY);
    setQuiz(initialQuizState);
    setTimeLeft(QUIZ_SECONDS);
    setError("");
  }

  function logout() {
    resetQuiz();
    setUser(null);
  }

  return (
    <main className="app-shell">
      <section className="quiz-surface" aria-label="Quiz application">
        <header className="topbar">
          <div>
            <p className="eyebrow">OpenTDB Quiz</p>
            <h1>React Quiz App</h1>
          </div>

          {user && (
            <div className="account">
              <span>
                <UserRound size={16} aria-hidden="true" />
                {user.name}
              </span>
              <button className="icon-button" type="button" onClick={logout} title="Logout">
                <LogOut size={18} aria-hidden="true" />
              </button>
            </div>
          )}
        </header>

        {!user && (
          <form className="login-panel" onSubmit={handleLogin}>
            <div>
              <p className="eyebrow">Login</p>
              <h2>Masuk untuk mulai kuis</h2>
            </div>

            <label>
              Nama
              <input name="name" type="text" placeholder="Masukkan nama" autoComplete="name" />
            </label>

            <label>
              Email
              <input name="email" type="email" placeholder="nama@email.com" autoComplete="email" />
            </label>

            {error && <p className="error-message">{error}</p>}

            <button className="primary-button" type="submit">
              <Play size={18} aria-hidden="true" />
              Login
            </button>
          </form>
        )}

        {user && quiz.status === "idle" && (
          <section className="start-panel">
            <div>
              <p className="eyebrow">Siap bermain</p>
              <h2>10 soal pilihan ganda, 5 menit.</h2>
            </div>

            <div className="stat-row">
              <div>
                <span>Total soal</span>
                <strong>{TOTAL_QUESTIONS}</strong>
              </div>
              <div>
                <span>Durasi</span>
                <strong>{formatTime(QUIZ_SECONDS)}</strong>
              </div>
              <div>
                <span>Tipe</span>
                <strong>Multiple</strong>
              </div>
            </div>

            {error && <p className="error-message">{error}</p>}

            <button className="primary-button" type="button" onClick={startQuiz} disabled={isLoading}>
              <Play size={18} aria-hidden="true" />
              {isLoading ? "Mengambil soal..." : "Mulai Kuis"}
            </button>
          </section>
        )}

        {user && isQuizActive && currentQuestion && (
          <section className="question-panel">
            <div className="quiz-meta" aria-label="Quiz progress">
              <div>
                <span>Total soal</span>
                <strong>{quiz.questions.length}</strong>
              </div>
              <div>
                <span>Dikerjakan</span>
                <strong>{quiz.answers.length}</strong>
              </div>
              <div>
                <span>Sisa waktu</span>
                <strong className={timeLeft <= 30 ? "danger" : ""}>
                  <Clock3 size={18} aria-hidden="true" />
                  {formatTime(timeLeft)}
                </strong>
              </div>
            </div>

            <div className="question-copy">
              <p>
                Soal {quiz.currentIndex + 1} dari {quiz.questions.length} - {currentQuestion.category}
              </p>
              <h2>{currentQuestion.question}</h2>
            </div>

            <div className="answer-grid" aria-label="Pilihan jawaban">
              {currentQuestion.options.map((option) => (
                <button key={option} type="button" onClick={() => answerQuestion(option)}>
                  {option}
                </button>
              ))}
            </div>
          </section>
        )}

        {user && isFinished && (
          <section className="result-panel">
            <div className="result-heading">
              <Award size={40} aria-hidden="true" />
              <div>
                <p className="eyebrow">Hasil Kuis</p>
                <h2>{result.correct} jawaban benar</h2>
              </div>
            </div>

            <div className="stat-row">
              <div>
                <span>Jumlah benar</span>
                <strong>{result.correct}</strong>
              </div>
              <div>
                <span>Jumlah salah</span>
                <strong>{result.wrong}</strong>
              </div>
              <div>
                <span>Jumlah jawab</span>
                <strong>
                  {result.answered}/{result.total}
                </strong>
              </div>
            </div>

            <div className="review-list">
              {quiz.answers.map((answer, index) => (
                <article key={answer.questionId}>
                  <div className={answer.isCorrect ? "review-icon correct" : "review-icon wrong"}>
                    {answer.isCorrect ? (
                      <CheckCircle2 size={18} aria-hidden="true" />
                    ) : (
                      <XCircle size={18} aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <p>
                      {index + 1}. {answer.question}
                    </p>
                    <span>
                      Jawaban: {answer.selectedAnswer}
                      {!answer.isCorrect && ` - Benar: ${answer.correctAnswer}`}
                    </span>
                  </div>
                </article>
              ))}
            </div>

            <button className="secondary-button" type="button" onClick={resetQuiz}>
              <RefreshCcw size={18} aria-hidden="true" />
              Ulangi Kuis
            </button>
          </section>
        )}
      </section>
    </main>
  );
}
