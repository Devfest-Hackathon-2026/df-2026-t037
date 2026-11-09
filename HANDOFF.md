# キャラクター進化の導入パッケージ

このフォルダの中身を、リポジトリ（my-hackathon-app）の同じ場所にコピーして使います。

| 入れる場所 | 中身 |
|---|---|
| frontend/src/characters/ | キャラの絵（svg 40枚）、動きのCSS、`Character.jsx` |
| frontend/src/game/ | 数値ルール `rules.js`、9大学16学部のデータ `universities.js` |
| backend/game_rules.py, backend/universities.json | サーバー用の同じ数値ルールとデータ（`python3 game_rules.py` で動作確認） |
| docs/design-spec.md | デザイン仕様書（決めごとはすべてここ） |
| docs/design/*.dc.html | 画面とボードのデザイン元ファイル（色・余白・文字サイズはここから） |
| docs/firestore-rules-snippet.txt | 今の firestore.rules に足すルール |

## VS Code の Claude に渡す依頼文（そのまま貼り付け）

```
docs/design-spec.md と docs/design/ の画面デザインを読んで、キャラクター進化をこのアプリに組み込んでください。

前提
- 今の仕組み（/advise の言語化採点、totalExp、study_logs、IDトークン認証、エラー表示、翻訳対策）は壊さない
- 数値ルールは frontend/src/game/rules.js と backend/game_rules.py をそのまま使い、式は変えない
- キャラの絵は frontend/src/characters/Character.jsx を使う。SVGは描き直さない
- 見た目は docs/design/ の .dc.html に合わせる（文字 M PLUS Rounded 1c、メイン色 #D0607A、背景 #FDF8F4）
- EXP・進化・親密度はバックエンドだけが書く

進め方（1つ終わるごとに止めて、変更点を説明してから次へ）
1. 今のファイル構成と App.jsx・main.py・firestore.rules を読み、どこに何を足すかの計画を出す
2. バックエンド：main.py に POST /plan（初期設定の保存と make_plan）を足し、/advise で growthExp（育成EXP×言語化ランク倍率）・stage・bond を study_logs と同じトランザクションで更新する
3. 画面：初期設定（Setup.dc.html・Select.dc.html）を足し、LevelCard の 🥚 を Character に置きかえ、「あと約◯時間」を出す（Launch.dc.html）
4. 勉強タイマー（Timer.dc.html）と着替え（Kisekae.dc.html）。着替えの入口はメニューの中だけ、タイマー中はロック
5. firestore.rules に docs/firestore-rules-snippet.txt を足す
6. npm --prefix frontend run build が通ることを確認する
```

## 注意
- 学年は今のアプリの「高校2年生」などを、`game_rules.py` の `GRADE_FROM_APP` で「高2」に読みかえる
- 要確認の数字（慶應の補正、学年の目安時間）は docs/design-spec.md の「7. 要確認」
