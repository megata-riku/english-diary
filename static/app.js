// 読み上げは、このページ全体で一つだけ再生する。
const speechAvailable = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
let activeSpeech = null;

function stopReading() {
    const previous = activeSpeech;
    activeSpeech = null; // cancelによる古いイベントを無視する
    if (speechAvailable) window.speechSynthesis.cancel();
    if (previous) {
        previous.stop.disabled = true;
        previous.status.textContent = "停止しました。";
    }
}

function createReadingControls(english) {
    const controls = document.createElement("div");
    const play = document.createElement("button");
    play.type = "button";
    play.textContent = "再生";
    const playSelected = document.createElement("button");
    playSelected.type = "button";
    playSelected.textContent = "選択部分を再生";
    const stop = document.createElement("button");
    stop.type = "button";
    stop.textContent = "停止";
    stop.disabled = true;
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    controls.append(play, playSelected, stop, status);

    if (!speechAvailable) {
        play.disabled = true;
        playSelected.disabled = true;
        status.textContent = "このブラウザは読み上げに対応していません。";
    }
    function readText(text) {
        text = text.trim();
        if (!text) {
            status.textContent = "先に英訳してください。";
            return;
        }
        // ブラウザで利用できる英語音声から選ぶ。
        const voices = window.speechSynthesis.getVoices();
        const englishVoices = voices.filter(v => /^en(?:[-_]|$)/i.test(v.lang));

        const voice =
            englishVoices.find(v => v.name === "Google US English")
            || englishVoices.find(v => v.lang.toLowerCase() === "en-us")
            || englishVoices[0];
        if (!voice) {
            status.textContent = voices.length === 0
                ? "音声を準備中です。少し待ってから再生を押してください。"
                : "英語音声が見つかりません。ブラウザや端末の音声設定を確認してください。";
            return;
        }
        stopReading();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = voice;
        utterance.lang = voice.lang;
        const baseRate = 0.85;
        const speedMultiplier = Number(
            document.querySelector("#reading-speed").value
        );
        utterance.rate = baseRate * speedMultiplier;
        const current = {utterance, stop, status};
        activeSpeech = current;
        stop.disabled = false;
        const voiceInfo = voice.localService
            ? voice.name + "／端末内音声"
            : voice.name + "／外部音声サービスに英文を送信";

        status.textContent = "再生を準備しています…（" + voiceInfo + "）";

        utterance.onstart = () => {
            if (activeSpeech === current) {
                status.textContent = "再生中（" + voiceInfo + "）";
            }
        };
        utterance.onend = () => {
            if (activeSpeech !== current) return;
            activeSpeech = null;
            stop.disabled = true;
            status.textContent = "再生が終わりました。";
        };
        utterance.onerror = event => {
            if (activeSpeech !== current) return;
            activeSpeech = null;
            stop.disabled = true;
            status.textContent = "読み上げに失敗しました（" + event.error + "）。もう一度再生してください。";
        };
        try {
            window.speechSynthesis.speak(utterance);
        } catch {
            stopReading();
            status.textContent = "読み上げを開始できませんでした。もう一度再生してください。";
        }
    }

    play.addEventListener("click", () => {
        readText(english.textContent);
    });

    playSelected.addEventListener("click", () => {
        const selection = window.getSelection();

        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            status.textContent = "読みたい英文をドラッグして選んでください。";
            return;
        }

        const range = selection.getRangeAt(0);

        if (
            !english.contains(range.startContainer)
            || !english.contains(range.endContainer)
        ) {
            status.textContent = "この日記の英文の中だけを選んでください。";
            return;
        }

        readText(selection.toString());
    });

    // マウスでボタンを押した際に、英文の選択が解除されるのを防ぐ。
    playSelected.addEventListener("mousedown", event => {
        event.preventDefault();
    });

    stop.addEventListener("click", stopReading);
    return controls;
}

if (speechAvailable) window.speechSynthesis.getVoices();
window.addEventListener("pagehide", stopReading);

const input = document.querySelector("#diary");
const button = document.querySelector("#save");
const message = document.querySelector("#message");
const history = document.querySelector("#history");

const expressionList = document.querySelector("#expressions");
const expressionMessage = document.querySelector("#expression-message");

async function fetchExpressionExplanation(expressionId) {
    const response = await fetch(
        "/api/expressions/" + expressionId + "/explain",
        {method: "POST"}
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            typeof result.detail === "string"
                ? result.detail
                : "意味の取得に失敗しました。"
        );
    }

    return result.expression;
}

async function loadExpressions() {
    const response = await fetch("/api/expressions");

    if (!response.ok) {
        throw new Error("表現の一覧を読み込めませんでした。");
    }

    const expressions = await response.json();
    expressionList.replaceChildren();

    expressionMessage.textContent = expressions.length === 0
        ? "まだ表現を保存していません。"
        : "";

    for (const expression of expressions) {
        const article = document.createElement("article");
        const source = document.createElement("strong");
        const text = document.createElement("p");

        source.textContent = expression.diary_id === null
            ? "元の日記は削除済み"
            : "日記 #" + expression.diary_id;

        text.textContent = expression.english;
        text.lang = "en";

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "削除";

        const deleteStatus = document.createElement("p");
        deleteStatus.setAttribute("role", "status");

        deleteButton.addEventListener("click", async () => {
            const confirmed = window.confirm(
                "この表現を完全に削除しますか？元に戻せません。\n\n"
                + expression.english
            );

            if (!confirmed) return;

            deleteButton.disabled = true;
            deleteStatus.textContent = "削除しています…";

            try {
                const response = await fetch(
                    "/api/expressions/" + expression.id,
                    {method: "DELETE"}
                );

                if (!response.ok) {
                    throw new Error("削除に失敗しました。");
                }

                // すでに削除済みの場合も、画面から取り除く
                article.remove();

                if (expressionList.children.length === 0) {
                    expressionMessage.textContent = "まだ表現を保存していません。";
                }
            } catch (error) {
                deleteStatus.textContent = error instanceof TypeError
                    ? "通信を確認できませんでした。再読み込みして確認するか、再試行してください。"
                    : error.message;

                deleteButton.disabled = false;
            }
        });

        const meaning = document.createElement("p");
        const nuance = document.createElement("p");
        const context = document.createElement("p");

        const explainButton = document.createElement("button");
        explainButton.type = "button";
        explainButton.textContent = "意味を取得・再試行";

        const explainStatus = document.createElement("p");
        explainStatus.setAttribute("role", "status");

        function showExplanation(item) {
            meaning.textContent = item.meaning === null
                ? "意味：未取得"
                : "意味：" + item.meaning;

            nuance.textContent = item.nuance
                ? "ニュアンス：" + item.nuance
                : "";

            context.textContent = item.context
                ? "文脈：" + item.context
                : "";

            explainButton.hidden = item.meaning !== null;
        }

        showExplanation(expression);

        explainButton.addEventListener("click", async () => {
            explainButton.disabled = true;
            explainStatus.textContent = "意味を取得しています…";

            try {
                const updated = await fetchExpressionExplanation(expression.id);
                showExplanation(updated);
                explainStatus.textContent = "取得して保存しました。";
            } catch (error) {
                explainStatus.textContent = error instanceof TypeError
                    ? "通信を確認できませんでした。再試行できます。"
                    : error.message;
            } finally {
                explainButton.disabled = false;
            }
        });

        const memoLabel = document.createElement("label");
        memoLabel.textContent = "自分用メモ";
        memoLabel.htmlFor = "memo-" + expression.id;

        const memoInput = document.createElement("textarea");
        memoInput.id = "memo-" + expression.id;
        memoInput.rows = 3;
        memoInput.maxLength = 5000;
        memoInput.placeholder = "使いたい場面や、覚えるためのヒントなど";
        memoInput.value = expression.memo ?? "";

        const memoSave = document.createElement("button");
        memoSave.type = "button";
        memoSave.textContent = "メモを保存";

        const memoStatus = document.createElement("p");
        memoStatus.setAttribute("role", "status");

        let savedMemo = memoInput.value;

        memoInput.addEventListener("input", () => {
            memoStatus.textContent = memoInput.value === savedMemo
                ? ""
                : "未保存の変更があります。";
        });

        memoSave.addEventListener("click", async () => {
            const submittedMemo = memoInput.value;

            memoSave.disabled = true;
            memoInput.disabled = true;
            memoStatus.textContent = "メモを保存しています…";

            try {
                const response = await fetch(
                    "/api/expressions/" + expression.id + "/memo",
                    {
                        method: "PATCH",
                        headers: {"Content-Type": "application/json"},
                        body: JSON.stringify({memo: submittedMemo})
                    }
                );

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(
                        typeof result.detail === "string"
                            ? result.detail
                            : "メモの保存に失敗しました。"
                    );
                }

                savedMemo = result.memo;
                memoStatus.textContent = "メモを保存しました。";
            } catch (error) {
                memoStatus.textContent = error instanceof TypeError
                    ? "通信を確認できませんでした。入力は残っています。同じ内容で再試行できます。"
                    : error.message;
            } finally {
                memoSave.disabled = false;
                memoInput.disabled = false;
            }
        });

        article.append(
            source,
            text,
            meaning,
            nuance,
            context,
            explainButton,
            explainStatus,
            memoLabel,
            memoInput,
            memoSave,
            memoStatus,
            deleteButton,
            deleteStatus
        );
        expressionList.append(article);
    }
}

function createExpressionControls(diaryId, english) {
    const controls = document.createElement("div");
    const save = document.createElement("button");
    const status = document.createElement("p");

    save.type = "button";
    save.textContent = "選択した表現を保存";
    status.setAttribute("role", "status");

    // マウス操作で選択が解除されるのを防ぐ
    save.addEventListener("mousedown", event => {
        event.preventDefault();
    });

    save.addEventListener("click", async () => {
        const selection = window.getSelection();

        if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
            status.textContent = "保存したい英文を選んでください。";
            return;
        }

        const range = selection.getRangeAt(0);

        if (
            !english.contains(range.startContainer)
            || !english.contains(range.endContainer)
        ) {
            status.textContent = "この日記の英文の中だけを選んでください。";
            return;
        }

        const selectedText = selection.toString().trim();

        if (!selectedText) {
            status.textContent = "空白以外の英文を選んでください。";
            return;
        }

        save.disabled = true;
        status.textContent = "保存しています…";

        try {
            const response = await fetch("/api/expressions", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    diary_id: diaryId,
                    english: selectedText
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(
                    typeof result.detail === "string"
                        ? result.detail
                        : "表現の保存に失敗しました。"
                );
            }

            // 保存成功と、意味の取得成功を区別する
            if (result.expression.meaning === null) {
                status.textContent =
                    "表現は保存済みです。意味とニュアンスを取得しています…";

                try {
                    await fetchExpressionExplanation(result.expression.id);
                    status.textContent =
                        "表現・意味・ニュアンス・文脈を保存しました。";
                } catch (error) {
                    status.textContent = error instanceof TypeError
                        ? "表現は保存済みです。意味の取得中に通信を確認できませんでした。一覧から再試行できます。"
                        : "表現は保存済みです。意味の取得："
                            + error.message;
                }
            } else {
                status.textContent =
                    "この表現と意味はすでに保存されています。";
            }

            try {
                await loadExpressions();
            } catch {
                expressionMessage.textContent =
                    "一覧の更新に失敗しました。ページを再読み込みしてください。";
            }


        } catch (error) {
            status.textContent = error instanceof TypeError
                ? "通信を確認できませんでした。同じ表現で再試行できます。"
                : error.message;
        } finally {
            save.disabled = false;
        }
    });

    controls.append(save, status);
    return controls;
}

async function loadDiaries() {
    const response = await fetch("/api/diaries");
    if (!response.ok) {
        throw new Error("日記の読み込みに失敗しました。");
    }

    const diaries = await response.json();
    stopReading();
    history.replaceChildren();

    for (const diary of diaries) {
        const article = document.createElement("article");
        const label = document.createElement("strong");
        const text = document.createElement("p");

        label.textContent = "日記 #" + diary.id;
        text.textContent = diary.japanese;
        const translateButton = document.createElement("button");
        translateButton.type = "button";
        translateButton.textContent = "英訳する";
        // 保存済みなら、再翻訳のボタンは表示しない。
        translateButton.hidden = diary.english !== null;

        const english = document.createElement("p");
        english.lang = "en";
        english.textContent = diary.english ?? "";
        const readingControls = createReadingControls(english);
        readingControls.hidden = diary.english === null;

        const expressionControls = createExpressionControls(diary.id, english);
        expressionControls.hidden = diary.english === null;

        const translationStatus = document.createElement("p");
        translationStatus.setAttribute("role", "status");
        translationStatus.textContent = diary.english !== null
            ? "保存済みの英訳" : "まだ英訳していません。";

        translateButton.addEventListener("click", async () => {
            translateButton.disabled = true;
            translationStatus.textContent = "英訳を取得しています…";

            try {
                const response = await fetch(
                    "/api/diaries/" + diary.id + "/translate",
                    {method: "POST"}
                );

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(
                        typeof result.detail === "string"
                        ? result.detail
                        : "英訳の取得に失敗しました。"
                    );
                }

                english.textContent = result.english;
                readingControls.hidden = false;
                expressionControls.hidden = false;
                translationStatus.textContent = result.cached
                    ? "保存済みの英訳を表示しました。"
                    : "英訳して保存しました。";

                translateButton.hidden = true;
            } catch (error) {
                translationStatus.textContent =
                    error instanceof TypeError
                    ? "通信できませんでした。接続を確認して再試行してください。"
                    : error.message;

                translateButton.textContent = "もう一度試す";
            } finally {
                translateButton.disabled = false;
            }
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "日記を削除";

        const deleteStatus = document.createElement("p");
        deleteStatus.setAttribute("role", "status");

        deleteButton.addEventListener("click", async () => {
            const confirmed = window.confirm(
                "日記 #" + diary.id + " と英訳を完全に削除しますか？\n"
                + "元に戻せません。保存した表現・意味・短い文脈・メモは残ります。"            );

            if (!confirmed) return;

            deleteButton.disabled = true;
            deleteStatus.textContent = "削除しています…";

            try {
                const response = await fetch(
                    "/api/diaries/" + diary.id,
                    {method: "DELETE"}
                );

                if (!response.ok) {
                    throw new Error("日記の削除に失敗しました。");
                }

                stopReading();
                article.remove();
                message.textContent = "日記と英訳を削除しました。";

                try {
                    await loadExpressions();
                } catch {
                    expressionMessage.textContent =
                        "日記は削除済みです。表現一覧の表示は再読み込みして確認してください。";
                }
            } catch (error) {
                deleteStatus.textContent = error instanceof TypeError
                    ? "通信を確認できませんでした。再読み込みして確認するか、再試行してください。"
                    : error.message;

                deleteButton.disabled = false;
            }
        });

        article.append(
            label,
            text,
            translateButton,
            translationStatus,
            english,
            readingControls,
            expressionControls,
            deleteButton,
            deleteStatus
        );

        history.append(article); 
    }
}

button.addEventListener("click", async () => {
    const japanese = input.value.trim();

    if (!japanese) {
        message.textContent = "日記を入力してね。";
        return;
    }

    button.disabled = true;
    input.disabled = true;
    message.textContent = "保存しています…";

    try {
        const response = await fetch("/api/diaries", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({japanese})
        });

        if (!response.ok) {
            throw new Error("保存に失敗しました。入力は残っています。");
        }

        input.value = "";
        message.textContent = "保存しました。";

        try {
            await loadDiaries();
        } catch {
            message.textContent =
                "保存は成功しました。一覧はページを再読み込みして確認してください。";
        }
    } catch (error) {
        message.textContent =
            error instanceof TypeError
            ? "通信を確認できませんでした。入力は残っています。再送前に一覧を確認してください。"
            : error.message;
    } finally {
        button.disabled = false;
        input.disabled = false;
    }
});

loadDiaries().catch(error => {
    message.textContent = error.message;
});

loadExpressions().catch(error => {
    expressionMessage.textContent = error.message;
});