# 云顶赛前阵容参考

测试站「赛前阵容参考」支持本地选择一个或多个 Riot TFT 对局 JSON。可输入单局详情、详情数组、带 `matches` 数组的文件，或 `data` 字段包含详情的采集记录。

只使用 S18 18.7 对应版本的八人标准排位终局。重叠不足或归属不明确的棋盘不会计入。列表显示匹配后的终局棋盘样本数、平均名次、前四率和登顶率。少于 10 个棋盘的条目会标记样本较少。这里的统计取决于导入的对局，不能代表全服榜单。

本地生成只含汇总的 JSON：

```powershell
node scripts/aggregate-tft-matches.mjs matches-1.json matches-2.json > match-samples.json
```

工具不联网获取战绩，也不输出玩家名、PUUID、原图或对局 ID。原始记录只应来自有权使用的导出。当前没有随网站发布的原始样本。

相关项目：[tft_game_research](https://github.com/christiangrier/tft_game_research) 提供 Riot 对局采集示例，[mtatft-data-collector](https://github.com/BuhDuy256/mtatft-data-collector) 提供对局归档管线，[tft-log](https://github.com/DwainYu/tft-log) 提供手工日志和明确标注的演示样本。
