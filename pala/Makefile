COMPOSE = docker-compose

up:
	docker rm -f $$(docker ps -aq --filter name=importer --filter status=exited) 2>/dev/null || true
	$(COMPOSE) up -d

down:
	$(COMPOSE) down --remove-orphans

restart:
	$(COMPOSE) restart

logs:
	$(COMPOSE) logs -f

status:
	$(COMPOSE) ps

reset:
	$(COMPOSE) down -v

open:
	xdg-open http://localhost:7076

rebuild:
	cd .. && npm run build --workspace=v2
	$(COMPOSE) build app

categories:
	sops exec-env secrets.sops.yaml -- uv run python3 pipeline/setup_categories.py

cleanup:
	sops exec-env secrets.sops.yaml -- \
	  uv run sh -c 'PYTHONPATH=pipeline python3 -c "\
import setup_categories as s; \
s.clear_transfer_categories(); s.cleanup_stale_categories(); s.cleanup_stale_rule_groups()"'

report:
	sops exec-env secrets.sops.yaml -- uv run python3 pipeline/generate_report.py

cron-install:
	(crontab -l 2>/dev/null; echo "0 8 1 * * cd $(CURDIR) && make report >> logs/report-cron.log 2>&1") | crontab -
	@echo "Cron installed. Run: crontab -l to verify."

importer-restart:
	$(COMPOSE) restart importer

pull-model:
	docker exec $$($(COMPOSE) ps -q ollama) ollama pull qwen2.5:0.5b

.PHONY: up down restart logs status reset open rebuild importer-restart categories cleanup report cron-install pull-model
